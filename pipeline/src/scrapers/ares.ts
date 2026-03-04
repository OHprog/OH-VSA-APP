import { ARES_CONFIG } from '../config/sources';
import { AresCompanyData, AresFinancialStatement, ScrapeResult } from '../types';
import { getFireCrawl } from '../utils/clients';
import { log, sleep } from '../utils/helpers';

// ============================================================
// ARES API - Czech Business Register
// Free government API, no authentication required
// Docs: https://ares.gov.cz/stranky/wsluzby
// ============================================================

/**
 * Look up a company by IČO in ARES.
 * Uses the free REST API directly (no FireCrawl needed).
 */
export async function lookupCompanyByICO(ico: string): Promise<AresCompanyData | null> {
  const url = ARES_CONFIG.endpoints.company(ico);
  log('info', 'ARES', `Looking up IČO: ${ico}`);

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) {
        log('warn', 'ARES', `IČO ${ico} not found`);
        return null;
      }
      throw new Error(`ARES API returned ${response.status}`);
    }

    const data = await response.json() as any;

    const company: AresCompanyData = {
      ico: data.ico || ico,
      company_name: data.obchodniJmeno || '',
      legal_form: data.pravniForma?.nazev || data.pravniForma?.kod || '',
      address: formatAresAddress(data.sidlo),
      registration_date: data.datumVzniku || '',
      business_activities: extractActivities(data),
      financial_statements_url: ARES_CONFIG.sbirka_listin.url(ico),
      status: mapAresStatus(data),
      raw_data: data,
    };

    log('info', 'ARES', `Found: ${company.company_name} (${company.ico})`);
    return company;
  } catch (error: any) {
    log('error', 'ARES', `Failed to look up ${ico}: ${error.message}`);
    return null;
  }
}

/**
 * Search for companies by name in ARES.
 */
export async function searchCompaniesByName(name: string): Promise<AresCompanyData[]> {
  const url = ARES_CONFIG.endpoints.search(name);
  log('info', 'ARES', `Searching for: ${name}`);

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`ARES search returned ${response.status}`);
    }

    const data = await response.json() as any;
    const results: AresCompanyData[] = [];

    const subjects = data.ekonomickeSubjekty || [];
    for (const subj of subjects.slice(0, 10)) {
      results.push({
        ico: subj.ico || '',
        company_name: subj.obchodniJmeno || '',
        legal_form: subj.pravniForma?.nazev || '',
        address: formatAresAddress(subj.sidlo),
        registration_date: subj.datumVzniku || '',
        business_activities: [],
        financial_statements_url: subj.ico ? ARES_CONFIG.sbirka_listin.url(subj.ico) : null,
        status: mapAresStatus(subj),
        raw_data: subj,
      });
    }

    log('info', 'ARES', `Found ${results.length} results for "${name}"`);
    return results;
  } catch (error: any) {
    log('error', 'ARES', `Search failed for "${name}": ${error.message}`);
    return [];
  }
}

/**
 * Scrape financial statements (Sbírka listin) using FireCrawl.
 * The documents are on justice.cz which requires scraping.
 */
export async function scrapeFinancialStatements(ico: string): Promise<AresFinancialStatement[]> {
  const url = ARES_CONFIG.sbirka_listin.url(ico);
  log('info', 'ARES', `Scraping Sbírka listin for IČO: ${ico}`);

  try {
    const firecrawl = getFireCrawl();
    const result = await firecrawl.scrapeUrl(url, {
      formats: ['markdown'],
    });

    if (!result.success || !result.markdown) {
      log('warn', 'ARES', `No content from Sbírka listin for ${ico}`);
      return [];
    }

    // Parse the page to find financial document links
    const statements = parseFinancialStatements(result.markdown, ico);
    log('info', 'ARES', `Found ${statements.length} financial statements for ${ico}`);
    return statements;
  } catch (error: any) {
    log('error', 'ARES', `Failed to scrape Sbírka listin for ${ico}: ${error.message}`);
    return [];
  }
}

// ============================================================
// Helper functions
// ============================================================

function formatAresAddress(sidlo: any): string {
  if (!sidlo) return '';
  const parts = [
    sidlo.nazevUlice,
    sidlo.cisloDomovni ? `${sidlo.cisloDomovni}${sidlo.cisloOrientacni ? '/' + sidlo.cisloOrientacni : ''}` : '',
    sidlo.nazevObce,
    sidlo.psc,
  ].filter(Boolean);
  return parts.join(', ');
}

function extractActivities(data: any): string[] {
  const activities: string[] = [];
  const czNace = data.czNace || [];
  for (const nace of czNace) {
    if (nace.nazev) {
      activities.push(`${nace.kod || ''} - ${nace.nazev}`.trim());
    }
  }
  return activities;
}

function mapAresStatus(data: any): AresCompanyData['status'] {
  if (data.datumZaniku) return 'inactive';
  const statusText = (data.stavSubjektu || '').toLowerCase();
  if (statusText.includes('likvidac')) return 'in_liquidation';
  return 'active';
}

function parseFinancialStatements(markdown: string, ico: string): AresFinancialStatement[] {
  const statements: AresFinancialStatement[] = [];
  const lines = markdown.split('\n');

  // Look for patterns like year references and document types
  const yearPattern = /\b(20\d{2})\b/;
  const docTypes = [
    'rozvaha', 'výkaz zisku a ztráty', 'výkaz zisků a ztrát',
    'příloha', 'výroční zpráva', 'cash flow', 'zpráva auditora',
    'účetní závěrka',
  ];

  for (const line of lines) {
    const yearMatch = line.match(yearPattern);
    if (!yearMatch) continue;

    const lineLower = line.toLowerCase();
    for (const docType of docTypes) {
      if (lineLower.includes(docType)) {
        // Extract URL if present
        const urlMatch = line.match(/\(([^)]+)\)/);
        statements.push({
          ico,
          period: yearMatch[1],
          document_url: urlMatch ? urlMatch[1] : '',
          document_type: docType,
          filing_date: yearMatch[1],
        });
        break;
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return statements.filter(s => {
    const key = `${s.period}-${s.document_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

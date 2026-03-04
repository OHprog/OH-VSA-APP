import { InsolvencyRecord, ScrapeResult } from '../types';
import { getFireCrawl } from '../utils/clients';
import { getMongoDB } from '../utils/clients';
import { log, sleep } from '../utils/helpers';

// ============================================================
// Insolvenční rejstřík (Czech Insolvency Register)
// URL: https://isir.justice.cz
// No public API – must scrape search results via FireCrawl
// ============================================================

const ISIR_SEARCH_URL = 'https://isir.justice.cz/isir/ueu/vysledek_lustrace.do';

/**
 * Check if a company (by IČO) has any insolvency records.
 * Scrapes the insolvency register search page.
 */
export async function checkInsolvency(ico: string): Promise<InsolvencyRecord[]> {
  log('info', 'Insolvency', `Checking IČO: ${ico}`);

  try {
    const firecrawl = getFireCrawl();

    // The insolvency register search URL with IČO parameter
    const searchUrl = `${ISIR_SEARCH_URL}?ic=${ico}&typ=ic`;

    const result = await firecrawl.scrapeUrl(searchUrl, {
      formats: ['markdown'],
      waitFor: 3000,  // Wait for dynamic content
    });

    if (!result.success || !result.markdown) {
      log('warn', 'Insolvency', `No content returned for IČO ${ico}`);
      return [];
    }

    const records = parseInsolvencyResults(result.markdown, ico);
    log('info', 'Insolvency', `Found ${records.length} records for IČO ${ico}`);

    // Store in MongoDB
    if (records.length > 0) {
      await storeInsolvencyRecords(records);
    }

    return records;
  } catch (error: any) {
    log('error', 'Insolvency', `Failed to check ${ico}: ${error.message}`);
    return [];
  }
}

/**
 * Check insolvency for a company by name.
 */
export async function checkInsolvencyByName(companyName: string): Promise<InsolvencyRecord[]> {
  log('info', 'Insolvency', `Checking name: ${companyName}`);

  try {
    const firecrawl = getFireCrawl();
    const searchUrl = `${ISIR_SEARCH_URL}?nazev=${encodeURIComponent(companyName)}&typ=nazev`;

    const result = await firecrawl.scrapeUrl(searchUrl, {
      formats: ['markdown'],
      waitFor: 3000,
    });

    if (!result.success || !result.markdown) {
      return [];
    }

    return parseInsolvencyResults(result.markdown, '');
  } catch (error: any) {
    log('error', 'Insolvency', `Failed to check "${companyName}": ${error.message}`);
    return [];
  }
}

/**
 * Batch check multiple IČOs for insolvency.
 * Adds delay between requests to avoid rate limiting.
 */
export async function batchCheckInsolvency(
  icos: string[],
  delayMs = 2000
): Promise<Map<string, InsolvencyRecord[]>> {
  const results = new Map<string, InsolvencyRecord[]>();

  for (const ico of icos) {
    const records = await checkInsolvency(ico);
    results.set(ico, records);
    if (icos.indexOf(ico) < icos.length - 1) {
      await sleep(delayMs);
    }
  }

  return results;
}

// ============================================================
// Parse insolvency search results
// ============================================================

function parseInsolvencyResults(markdown: string, ico: string): InsolvencyRecord[] {
  const records: InsolvencyRecord[] = [];
  const lines = markdown.split('\n');

  // Check for "no results" indicators
  const noResultPatterns = [
    /nebyl[ay]?\s*nalezen/i,
    /žádný\s*záznam/i,
    /nebylo\s*nalezeno/i,
    /0\s*záznam/i,
  ];

  for (const pattern of noResultPatterns) {
    if (pattern.test(markdown)) {
      log('info', 'Insolvency', `No insolvency records found for ${ico}`);
      return [];
    }
  }

  // Parse case entries
  // Typical format: case number (e.g., KSBR 28 INS 12345/2024), company name, status
  const casePattern = /([A-Z]{2,4}\s+\d+\s+INS\s+\d+\/\d{4})/g;
  const statusPatterns: Record<string, string> = {
    'prohlášen úpadek': 'active',
    'oddlužení': 'active',
    'konkurz': 'active',
    'reorganizace': 'active',
    'zamítnuto': 'dismissed',
    'zastaveno': 'dismissed',
    'skončeno': 'resolved',
    'splněno': 'resolved',
    'pravomocně skončeno': 'resolved',
  };

  let currentCase: Partial<InsolvencyRecord> | null = null;

  for (const line of lines) {
    const caseMatch = line.match(casePattern);
    if (caseMatch) {
      // Save previous case
      if (currentCase?.case_number) {
        records.push(currentCase as InsolvencyRecord);
      }

      currentCase = {
        ico,
        company_name: '',
        case_number: caseMatch[0].trim(),
        status: 'active',
        filing_date: '',
        court: extractCourt(caseMatch[0]),
        details_url: `https://isir.justice.cz/isir/ueu/evidence_upadcu_detail.do?rowid_spzn=${encodeURIComponent(caseMatch[0].trim())}`,
        raw_data: { source_line: line },
      };
    }

    // Try to extract status
    if (currentCase) {
      const lineLower = line.toLowerCase();
      for (const [pattern, status] of Object.entries(statusPatterns)) {
        if (lineLower.includes(pattern)) {
          currentCase.status = status;
          break;
        }
      }

      // Try to extract date
      const dateMatch = line.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      if (dateMatch && !currentCase.filing_date) {
        currentCase.filing_date = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
      }

      // Try to extract company name
      const nameMatch = line.match(/(?:dlužník|úpadce)[:\s]+(.+)/i);
      if (nameMatch) {
        currentCase.company_name = nameMatch[1].trim();
      }
    }
  }

  // Don't forget the last case
  if (currentCase?.case_number) {
    records.push(currentCase as InsolvencyRecord);
  }

  return records;
}

function extractCourt(caseNumber: string): string {
  const courtCodes: Record<string, string> = {
    'KSBR': 'Krajský soud v Brně',
    'KSPH': 'Krajský soud v Praze',
    'MSPH': 'Městský soud v Praze',
    'KSOS': 'Krajský soud v Ostravě',
    'KSCB': 'Krajský soud v Českých Budějovicích',
    'KSPL': 'Krajský soud v Plzni',
    'KSUL': 'Krajský soud v Ústí nad Labem',
    'KSHK': 'Krajský soud v Hradci Králové',
  };

  const code = caseNumber.split(' ')[0];
  return courtCodes[code] || code;
}

// ============================================================
// MongoDB storage
// ============================================================

async function storeInsolvencyRecords(records: InsolvencyRecord[]): Promise<void> {
  try {
    const db = await getMongoDB();
    const collection = db.collection('insolvency_records');

    for (const record of records) {
      await collection.updateOne(
        { case_number: record.case_number },
        { $set: { ...record, updated_at: new Date().toISOString() } },
        { upsert: true }
      );
    }

    log('info', 'Insolvency', `Stored ${records.length} records in MongoDB`);
  } catch (error: any) {
    log('error', 'Insolvency', `Failed to store records: ${error.message}`);
  }
}

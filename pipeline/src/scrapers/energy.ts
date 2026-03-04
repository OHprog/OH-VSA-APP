import { EnergyLicenseData } from '../types';
import { getFireCrawl, getMongoDB } from '../utils/clients';
import { log, sleep } from '../utils/helpers';

// ============================================================
// Energy Sector Data
// ERÚ license holder database, OTE market data, ČEPS grid data
// ============================================================

/**
 * Check if a company holds energy licenses via ERÚ.
 * ERÚ has a public license holder database.
 */
export async function checkEnergyLicenses(ico: string): Promise<EnergyLicenseData[]> {
  log('info', 'Energy', `Checking energy licenses for IČO: ${ico}`);

  try {
    const firecrawl = getFireCrawl();

    // ERÚ license holder search
    const searchUrl = `https://www.eru.cz/licence?ico=${ico}`;
    const result = await firecrawl.scrapeUrl(searchUrl, {
      formats: ['markdown'],
      waitFor: 3000,
    });

    if (!result.success || !result.markdown) {
      log('info', 'Energy', `No license data found for IČO ${ico}`);
      return [];
    }

    const licenses = parseLicenseResults(result.markdown, ico);

    // Store in MongoDB
    if (licenses.length > 0) {
      await storeLicenses(licenses);
    }

    log('info', 'Energy', `Found ${licenses.length} energy licenses for IČO ${ico}`);
    return licenses;
  } catch (error: any) {
    log('error', 'Energy', `Failed to check licenses for ${ico}: ${error.message}`);
    return [];
  }
}

/**
 * Scrape energy market news from ERÚ, OTE, ČEPS.
 * This is handled by the general FireCrawl scraper in firecrawl-scraper.ts
 * via ENERGY_SOURCES config. This file adds energy-specific data extraction.
 */

/**
 * Get OTE electricity market data (day-ahead prices).
 * OTE publishes daily market reports.
 */
export async function getOTEMarketData(): Promise<any> {
  log('info', 'Energy', 'Fetching OTE market data');

  try {
    const firecrawl = getFireCrawl();
    const result = await firecrawl.scrapeUrl('https://www.ote-cr.cz/cs/kratkodobe-trhy/elektrina/denni-trh', {
      formats: ['markdown'],
      waitFor: 3000,
    });

    if (!result.success || !result.markdown) {
      return null;
    }

    // Parse market data from the page
    return {
      source: 'OTE',
      scraped_at: new Date().toISOString(),
      raw_content: result.markdown,
      metadata: result.metadata || {},
    };
  } catch (error: any) {
    log('error', 'Energy', `Failed to fetch OTE data: ${error.message}`);
    return null;
  }
}

/**
 * Get ČEPS grid data (load, generation mix).
 */
export async function getCEPSGridData(): Promise<any> {
  log('info', 'Energy', 'Fetching ČEPS grid data');

  try {
    const firecrawl = getFireCrawl();
    const result = await firecrawl.scrapeUrl('https://www.ceps.cz/cs/data', {
      formats: ['markdown'],
      waitFor: 3000,
    });

    if (!result.success || !result.markdown) {
      return null;
    }

    return {
      source: 'ČEPS',
      scraped_at: new Date().toISOString(),
      raw_content: result.markdown,
      metadata: result.metadata || {},
    };
  } catch (error: any) {
    log('error', 'Energy', `Failed to fetch ČEPS data: ${error.message}`);
    return null;
  }
}

// ============================================================
// Parsers
// ============================================================

function parseLicenseResults(markdown: string, ico: string): EnergyLicenseData[] {
  const licenses: EnergyLicenseData[] = [];

  // Check for no results
  if (/nebyl[ay]?\s*nalezen|žádná\s*licence|0\s*výsledk/i.test(markdown)) {
    return [];
  }

  const lines = markdown.split('\n').filter(l => l.trim());

  // License types in Czech
  const licenseTypes: Record<string, string> = {
    'výroba elektřiny': 'electricity_generation',
    'distribuce elektřiny': 'electricity_distribution',
    'obchod s elektřinou': 'electricity_trading',
    'výroba tepla': 'heat_generation',
    'distribuce plynu': 'gas_distribution',
    'obchod s plynem': 'gas_trading',
    'přenos elektřiny': 'electricity_transmission',
    'přeprava plynu': 'gas_transmission',
  };

  let companyName = '';

  for (const line of lines) {
    const lineLower = line.toLowerCase();

    // Extract company name
    const nameMatch = line.match(/(?:držitel|subjekt)[:\s]+(.+)/i);
    if (nameMatch) {
      companyName = nameMatch[1].trim();
    }

    // Check for license types
    for (const [czType, enType] of Object.entries(licenseTypes)) {
      if (lineLower.includes(czType)) {
        // Extract license number
        const numMatch = line.match(/(?:č\.|číslo|licence)[:\s]*(\d[\d\s/-]+\d)/i);

        // Extract dates
        const dateMatches = line.match(/(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/g) || [];

        licenses.push({
          ico,
          company_name: companyName,
          license_type: enType,
          license_number: numMatch ? numMatch[1].trim() : `${enType}-${ico}`,
          valid_from: dateMatches[0] ? parseCzechDate(dateMatches[0]) : '',
          valid_to: dateMatches[1] ? parseCzechDate(dateMatches[1]) : null,
          status: 'active',
          source: 'eru',
        });
        break;
      }
    }
  }

  return licenses;
}

function parseCzechDate(dateStr: string): string {
  const match = dateStr.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return dateStr;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

// ============================================================
// MongoDB storage
// ============================================================

async function storeLicenses(licenses: EnergyLicenseData[]): Promise<void> {
  try {
    const db = await getMongoDB();
    const collection = db.collection('energy_licenses');

    for (const license of licenses) {
      await collection.updateOne(
        { license_number: license.license_number },
        { $set: { ...license, updated_at: new Date().toISOString() } },
        { upsert: true }
      );
    }

    log('info', 'Energy', `Stored ${licenses.length} licenses in MongoDB`);
  } catch (error: any) {
    log('error', 'Energy', `Failed to store licenses: ${error.message}`);
  }
}

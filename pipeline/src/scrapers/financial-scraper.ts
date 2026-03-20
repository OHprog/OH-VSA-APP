import { getFireCrawl, getAIML } from '../utils/clients';
import { log } from '../utils/helpers';
import { scrapeFinancialStatements } from './ares';
import type { FinancialSnapshot, FinancialFigures, FinancialRatios } from '../types';

// ============================================================
// Financial statement scraper
// Extends the existing scrapeFinancialStatements() stub in ares.ts
// (which lists document URLs) by actually scraping the document
// and extracting financial figures via LLM.
//
// Never throws — all errors are caught and logged; returns null
// to allow graceful fallback to ARES-only scoring.
// ============================================================

const REQUIRED_FIELDS: (keyof FinancialFigures)[] = [
  'revenue', 'net_profit', 'total_assets',
  'equity', 'current_assets', 'current_liabilities',
];

const PREFERRED_DOC_TYPES = [
  'účetní závěrka', 'ucetni zaverka', 'rozvaha',
  'výkaz zisku a ztráty', 'vykaz zisku a ztrat',
];

/**
 * Scrape and extract financial KPIs for a Czech company from Sbírka listin.
 *
 * Flow:
 *   1. Use ares.scrapeFinancialStatements() to list filed documents
 *   2. Pick the most recent Účetní závěrka / Rozvaha document URL
 *   3. FireCrawl-scrape the document to markdown
 *   4. Use gpt-4o-mini to extract Czech financial figures as JSON
 *   5. Compute ratios deterministically (pure math, no AI)
 *   6. Return assembled FinancialSnapshot (id: null — not yet in DB)
 */
export async function scrapeFinancialData(
  ico: string,
  companyName: string,
  _financialStatementsUrl: string | null
): Promise<FinancialSnapshot | null> {
  log('info', 'FinancialScraper', `Scraping financial data for ${companyName} (IČO: ${ico})`);

  // Step 1: Get document list from Sbírka listin
  const statements = await scrapeFinancialStatements(ico);

  if (!statements || statements.length === 0) {
    log('warn', 'FinancialScraper', `No financial statement documents found for ${ico}`);
    return null;
  }

  // Step 2: Pick the best document — prefer Účetní závěrka, most recent year
  const best = pickBestDocument(statements);
  if (!best || !best.document_url) {
    log('warn', 'FinancialScraper', `No usable document URL found for ${ico}`);
    return null;
  }

  log('info', 'FinancialScraper', `Using document: ${best.document_type} (${best.period}) — ${best.document_url}`);

  // Step 3: Scrape the actual document
  let markdown: string;
  try {
    const firecrawl = getFireCrawl();
    const result = await firecrawl.scrapeUrl(best.document_url, { formats: ['markdown'] });

    if (!result.success || !result.markdown) {
      log('warn', 'FinancialScraper', `FireCrawl returned no content for ${best.document_url}`);
      return null;
    }
    markdown = result.markdown;
  } catch (err: any) {
    log('error', 'FinancialScraper', `FireCrawl scrape failed for ${best.document_url}: ${err.message}`);
    return null;
  }

  // Step 4: Extract financial figures via LLM
  let rawExtraction: Record<string, any> = {};
  let extractedFigures: Record<string, any> = {};

  try {
    const aiml = getAIML();
    const response = await aiml.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.0,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Jsi účetní analytik. Dostaneš text z výroční zprávy nebo účetní závěrky české firmy.',
            'Extrahuj přesně tato čísla (v tisících Kč):',
            '  revenue (Tržby celkem nebo Výnosy celkem)',
            '  operating_profit (Provozní výsledek hospodaření)',
            '  net_profit (Výsledek hospodaření za účetní období)',
            '  total_assets (Aktiva celkem)',
            '  equity (Vlastní kapitál)',
            '  total_liabilities (Cizí zdroje)',
            '  current_assets (Oběžná aktiva)',
            '  current_liabilities (Krátkodobé závazky)',
            '  fiscal_year (rok účetního období, celé číslo)',
            'Čísla jsou zapsána s tečkami jako oddělovači tisíců a čárkou jako desetinnou čárkou',
            '(např. "1.234.567" = 1234567, "1.234,56" = 1234.56).',
            'Vrať JSON objekt s těmito klíči. Pokud číslo nenajdeš, použij null.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: markdown.slice(0, 12000), // limit to avoid token overflow
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      rawExtraction = JSON.parse(content);
      extractedFigures = rawExtraction;
    }
  } catch (err: any) {
    log('error', 'FinancialScraper', `LLM extraction failed for ${ico}: ${err.message}`);
    // Return a partial snapshot with null figures — still links to the document
    return buildSnapshot(ico, companyName, best, {}, rawExtraction);
  }

  // Step 5: Parse Czech numbers and compute ratios
  return buildSnapshot(ico, companyName, best, extractedFigures, rawExtraction);
}

// ============================================================
// Helpers
// ============================================================

function pickBestDocument(
  statements: Awaited<ReturnType<typeof scrapeFinancialStatements>>
): (typeof statements)[0] | null {
  if (!statements.length) return null;

  // Score each statement: preferred doc type gets +10, higher year gets year value
  const scored = statements
    .filter(s => s.document_url)
    .map(s => {
      const typeLower = (s.document_type || '').toLowerCase();
      const typeScore = PREFERRED_DOC_TYPES.some(t => typeLower.includes(t)) ? 10 : 0;
      const yearScore = parseInt(s.period, 10) || 0;
      return { s, score: typeScore + yearScore };
    });

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].s;
}

/**
 * Parse a Czech-formatted number string or raw number.
 * Czech format: dots are thousand separators, comma is decimal.
 * E.g. "1.234.567" → 1234567, "1.234,56" → 1234.56
 */
function parseCzechNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const s = String(value).trim();
  if (!s) return null;
  // Remove thousand-separator dots, replace decimal comma with dot
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Safe division — returns null if either operand is null/zero.
 * Rounds to 4 decimal places for consistent DB storage.
 */
function safeDiv(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return Math.round((a / b) * 10000) / 10000;
}

function computeRatios(f: FinancialFigures): FinancialRatios {
  return {
    profit_margin:  safeDiv(f.net_profit, f.revenue),
    equity_ratio:   safeDiv(f.equity, f.total_assets),
    current_ratio:  safeDiv(f.current_assets, f.current_liabilities),
    debt_to_equity: safeDiv(f.total_liabilities, f.equity),
    roa:            safeDiv(f.net_profit, f.total_assets),
  };
}

function buildSnapshot(
  ico: string,
  companyName: string,
  doc: { period: string; document_url: string; document_type: string },
  extracted: Record<string, any>,
  rawExtraction: Record<string, any>
): FinancialSnapshot {
  const figures: FinancialFigures = {
    revenue:             parseCzechNumber(extracted.revenue),
    operating_profit:    parseCzechNumber(extracted.operating_profit),
    net_profit:          parseCzechNumber(extracted.net_profit),
    total_assets:        parseCzechNumber(extracted.total_assets),
    equity:              parseCzechNumber(extracted.equity),
    total_liabilities:   parseCzechNumber(extracted.total_liabilities),
    current_assets:      parseCzechNumber(extracted.current_assets),
    current_liabilities: parseCzechNumber(extracted.current_liabilities),
  };

  const ratios = computeRatios(figures);

  const data_complete = REQUIRED_FIELDS.every(k => figures[k] !== null);

  // Prefer LLM-extracted year; fall back to document period
  const fiscalYear = parseCzechNumber(extracted.fiscal_year)
    ?? parseInt(doc.period, 10)
    ?? new Date().getFullYear() - 1;

  return {
    id: null,
    supplier_ico:   ico,
    company_name:   companyName,
    fiscal_year:    fiscalYear,
    source_url:     doc.document_url,
    document_type:  doc.document_type,
    scraped_at:     new Date().toISOString(),
    data_complete,
    figures,
    ratios,
    raw_extraction: rawExtraction,
  };
}

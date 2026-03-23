import { getFireCrawl, getAIML } from '../utils/clients';
import { log } from '../utils/helpers';
import { OPENCORPORATES_CONFIG } from '../config/sources';
import type { FinancialSnapshot, FinancialFigures, FinancialRatios } from '../types';

// ============================================================
// International financial data scraper
// Three sources tried in order:
//   1. OpenCorporates  — registration status / company health (all companies)
//   2. FMP API         — full financials for publicly listed companies
//   3. Company IR page — FireCrawl + AI extraction (unlisted companies with a website)
//
// Never throws — all errors are caught and logged.
// Returns null only if all three sources fail entirely.
// ============================================================

const FMP_BASE = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com/api/v3';
const FMP_KEY  = process.env.FMP_API_KEY || '';

const REQUIRED_FIELDS: (keyof FinancialFigures)[] = [
  'revenue', 'net_profit', 'total_assets',
  'equity', 'current_assets', 'current_liabilities',
];

// ── Public API ────────────────────────────────────────────────

export async function scrapeInternationalFinancialData(
  companyName: string,
  country: string,
  websiteUrl: string | null
): Promise<FinancialSnapshot | null> {
  log('info', 'IntlFinancialScraper', `Scraping international data for "${companyName}" (${country || 'unknown country'})`);

  const rawExtraction: Record<string, any> = {};

  // ── Source 1: OpenCorporates ─────────────────────────────
  const ocData = await fetchOpenCorporates(companyName, country);
  rawExtraction.opencorporates = ocData;

  // ── Source 2: FMP API (listed companies) ─────────────────
  let figures: FinancialFigures = emptyFigures();
  let fiscalYear: number = new Date().getFullYear() - 1;
  let sourceUrl: string | null = null;
  let documentType: string = 'opencorporates_only';
  let fmpData: Record<string, any> | null = null;

  if (FMP_KEY) {
    fmpData = await fetchFmpFinancials(companyName);
    rawExtraction.fmp = fmpData;

    if (fmpData?.figures) {
      figures = fmpData.figures;
      fiscalYear = fmpData.fiscal_year ?? fiscalYear;
      sourceUrl = fmpData.source_url ?? null;
      documentType = 'fmp_api';
    }
  } else {
    log('warn', 'IntlFinancialScraper', 'FMP_API_KEY not set — skipping FMP source');
  }

  // ── Source 3: IR page via FireCrawl (fallback) ───────────
  let irData: Record<string, any> | null = null;
  const needsIrScrape = !isComplete(figures) && !!websiteUrl;

  if (needsIrScrape) {
    irData = await fetchIrPage(websiteUrl!, companyName);
    rawExtraction.ir = irData;

    if (irData?.figures) {
      figures = mergeFigures(figures, irData.figures);
      if (!sourceUrl) sourceUrl = irData.source_url ?? null;
      documentType = 'ir_page';
    }
  }

  // If no financial figures at all AND no OpenCorporates data, give up
  if (!ocData && !isAnyFigure(figures)) {
    log('warn', 'IntlFinancialScraper', `No data found for "${companyName}" from any source`);
    return null;
  }

  const ratios = computeRatios(figures);
  const data_complete = REQUIRED_FIELDS.every(k => figures[k] !== null);

  return {
    id: null,
    supplier_ico: '',          // caller sets cache key via financialCacheKey()
    company_name: companyName,
    fiscal_year: fiscalYear,
    source_url: sourceUrl,
    document_type: documentType,
    scraped_at: new Date().toISOString(),
    data_complete,
    figures,
    ratios,
    raw_extraction: rawExtraction,
  };
}

// ── Source 1: OpenCorporates ──────────────────────────────────

export interface OpenCorporatesResult {
  status: 'active' | 'inactive' | 'dissolved' | 'unknown';
  years_old: number | null;
  company_type: string | null;
  incorporation_date: string | null;
  jurisdiction: string | null;
}

async function fetchOpenCorporates(
  companyName: string,
  country: string
): Promise<OpenCorporatesResult | null> {
  try {
    // Try with jurisdiction first; fall back to global search
    const urls = [
      country ? OPENCORPORATES_CONFIG.search_url(companyName, country) : null,
      OPENCORPORATES_CONFIG.search_url(companyName),
    ].filter(Boolean) as string[];

    for (const url of urls) {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) continue;

      const json = await res.json() as any;
      const companies = json?.results?.companies ?? [];
      if (!companies.length) continue;

      const company = companies[0]?.company;
      if (!company) continue;

      const status = parseOcStatus(company.current_status);
      const yearsOld = company.incorporation_date
        ? (Date.now() - new Date(company.incorporation_date).getTime()) / (1000 * 60 * 60 * 24 * 365)
        : null;

      log('info', 'IntlFinancialScraper', `OpenCorporates: found "${company.name}" — status: ${status}`);

      return {
        status,
        years_old: yearsOld !== null ? Math.floor(yearsOld) : null,
        company_type: company.company_type ?? null,
        incorporation_date: company.incorporation_date ?? null,
        jurisdiction: company.jurisdiction_code ?? null,
      };
    }

    log('warn', 'IntlFinancialScraper', `OpenCorporates: no results for "${companyName}"`);
    return null;
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `OpenCorporates fetch failed: ${err.message}`);
    return null;
  }
}

function parseOcStatus(raw: string | null | undefined): OpenCorporatesResult['status'] {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (s.includes('active') || s === 'registered' || s === 'live') return 'active';
  if (s.includes('dissolv') || s.includes('struck') || s.includes('liquidat')) return 'dissolved';
  if (s.includes('inactive') || s.includes('dormant') || s.includes('deregistered')) return 'inactive';
  return 'unknown';
}

// ── Source 2: Financial Modeling Prep API ────────────────────

async function fetchFmpFinancials(
  companyName: string
): Promise<{ figures: FinancialFigures; fiscal_year: number; source_url: string | null } | null> {
  try {
    // Step 1: Search for ticker
    const searchRes = await fetch(
      `${FMP_BASE}/search?query=${encodeURIComponent(companyName)}&limit=1&apikey=${FMP_KEY}`
    );
    if (!searchRes.ok) {
      log('warn', 'IntlFinancialScraper', `FMP search returned ${searchRes.status}`);
      return null;
    }

    const searchData = await searchRes.json() as any[];
    if (!searchData?.length) {
      log('info', 'IntlFinancialScraper', `FMP: no ticker found for "${companyName}"`);
      return null;
    }

    const ticker = searchData[0]?.symbol;
    if (!ticker) return null;

    log('info', 'IntlFinancialScraper', `FMP: found ticker ${ticker} for "${companyName}"`);

    // Step 2: Fetch income statement and balance sheet in parallel
    const [incomeRes, balanceRes] = await Promise.all([
      fetch(`${FMP_BASE}/income-statement/${ticker}?limit=1&period=annual&apikey=${FMP_KEY}`),
      fetch(`${FMP_BASE}/balance-sheet-statement/${ticker}?limit=1&period=annual&apikey=${FMP_KEY}`),
    ]);

    if (!incomeRes.ok || !balanceRes.ok) {
      log('warn', 'IntlFinancialScraper', `FMP financials fetch failed for ${ticker}`);
      return null;
    }

    const incomeData = await incomeRes.json() as any[];
    const balanceData = await balanceRes.json() as any[];

    const income  = incomeData?.[0];
    const balance = balanceData?.[0];

    if (!income && !balance) return null;

    const figures: FinancialFigures = {
      revenue:             income?.revenue ?? null,
      operating_profit:    income?.operatingIncome ?? null,
      net_profit:          income?.netIncome ?? null,
      total_assets:        balance?.totalAssets ?? null,
      equity:              balance?.totalStockholdersEquity ?? null,
      total_liabilities:   balance?.totalLiabilities ?? null,
      current_assets:      balance?.totalCurrentAssets ?? null,
      current_liabilities: balance?.totalCurrentLiabilities ?? null,
    };

    const fiscal_year = parseInt(income?.calendarYear ?? balance?.calendarYear ?? String(new Date().getFullYear() - 1), 10);
    const source_url = `https://financialmodelingprep.com/financial-statements/${ticker}`;

    log('info', 'IntlFinancialScraper', `FMP: got financials for ${ticker} (FY ${fiscal_year})`);
    return { figures, fiscal_year, source_url };
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `FMP fetch failed: ${err.message}`);
    return null;
  }
}

// ── Source 3: Company IR page via FireCrawl + AI ─────────────

async function fetchIrPage(
  websiteUrl: string,
  companyName: string
): Promise<{ figures: FinancialFigures; source_url: string | null } | null> {
  try {
    const firecrawl = getFireCrawl();

    // Find IR / annual report page
    let irUrl: string | null = null;
    try {
      const mapped = await firecrawl.mapUrl(websiteUrl, {
        search: 'annual report investor relations financial results',
        limit: 5,
      });
      const urls: string[] = (mapped as any)?.links ?? (mapped as any)?.urls ?? [];
      irUrl = urls.find((u) =>
        /investor|\/ir\/|annual.report|financial.results|financial.statements/i.test(u)
      ) ?? null;
    } catch {
      // mapUrl failed — try a known IR path directly
    }

    // Fallback: try common IR URL patterns
    if (!irUrl) {
      const base = websiteUrl.replace(/\/$/, '');
      irUrl = `${base}/investor-relations`;
    }

    log('info', 'IntlFinancialScraper', `IR page scrape: ${irUrl}`);

    const result = await firecrawl.scrapeUrl(irUrl, { formats: ['markdown'] });
    if (!result.success || !result.markdown) {
      log('warn', 'IntlFinancialScraper', `IR page scrape returned no content for ${irUrl}`);
      return null;
    }

    // Extract figures via gpt-4o-mini
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
            'You are a financial analyst. Extract from the text:',
            'revenue, operating_profit, net_profit, total_assets, equity,',
            'total_liabilities, current_assets, current_liabilities, fiscal_year.',
            'Numbers may use commas as thousand separators (1,234,567).',
            'Values may be in millions or billions — normalize to base unit (e.g. "$1.2B" = 1200000000).',
            'Return a JSON object with these exact keys. Missing values = null.',
          ].join(' '),
        },
        {
          role: 'user',
          content: result.markdown.slice(0, 12000),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const extracted = JSON.parse(content);
    const figures: FinancialFigures = {
      revenue:             parseNumber(extracted.revenue),
      operating_profit:    parseNumber(extracted.operating_profit),
      net_profit:          parseNumber(extracted.net_profit),
      total_assets:        parseNumber(extracted.total_assets),
      equity:              parseNumber(extracted.equity),
      total_liabilities:   parseNumber(extracted.total_liabilities),
      current_assets:      parseNumber(extracted.current_assets),
      current_liabilities: parseNumber(extracted.current_liabilities),
    };

    log('info', 'IntlFinancialScraper', `IR page: extracted figures for "${companyName}"`);
    return { figures, source_url: irUrl };
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `IR page scrape failed: ${err.message}`);
    return null;
  }
}

// ── Math helpers ──────────────────────────────────────────────

function emptyFigures(): FinancialFigures {
  return {
    revenue: null, operating_profit: null, net_profit: null,
    total_assets: null, equity: null, total_liabilities: null,
    current_assets: null, current_liabilities: null,
  };
}

function isComplete(f: FinancialFigures): boolean {
  return REQUIRED_FIELDS.every(k => f[k] !== null);
}

function isAnyFigure(f: FinancialFigures): boolean {
  return Object.values(f).some(v => v !== null);
}

/** Merge two figure sets — prefer non-null values from primary */
function mergeFigures(primary: FinancialFigures, secondary: FinancialFigures): FinancialFigures {
  const result = { ...primary };
  for (const key of Object.keys(secondary) as (keyof FinancialFigures)[]) {
    if (result[key] === null && secondary[key] !== null) {
      result[key] = secondary[key];
    }
  }
  return result;
}

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

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const s = String(value).trim().replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

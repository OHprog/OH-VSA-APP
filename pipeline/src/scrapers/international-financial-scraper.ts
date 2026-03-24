import { getFireCrawl, getAIML } from '../utils/clients';
import { log } from '../utils/helpers';
import { OPENCORPORATES_CONFIG } from '../config/sources';
import type { FinancialSnapshot, FinancialFigures, FinancialRatios } from '../types';

// ============================================================
// International financial data scraper
// Sources (all run, figures merged by priority):
//   0. Wikipedia         — company description, infobox financials, basic info
//   1. OpenCorporates    — registration status / company health
//   2. FMP API           — full financials + stock quote for listed companies
//   2b. Yahoo Finance    — financials via FireCrawl scraping (uses FMP ticker)
//   3. Company IR page   — FireCrawl + AI extraction (unlisted with website)
//   4. Web annual report — FireCrawl search for published annual reports
//
// FMP preferred, Yahoo fills gaps. Never throws — all errors caught and logged.
// ============================================================

const FMP_BASE = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com/stable';
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

  // ── Source 0: Wikipedia (parallel with OpenCorporates) ───
  const [wikiData, ocData] = await Promise.all([
    fetchWikipediaData(companyName),
    fetchOpenCorporates(companyName, country),
  ]);
  rawExtraction.wikipedia    = wikiData;
  rawExtraction.opencorporates = ocData;

  // ── Sources 2 + 2b: FMP API and Yahoo Finance (parallel) ─
  let figures: FinancialFigures = emptyFigures();
  let fiscalYear: number = new Date().getFullYear() - 1;
  let sourceUrl: string | null = null;
  const activeSources: string[] = [];

  if (!FMP_KEY) log('warn', 'IntlFinancialScraper', 'FMP_API_KEY not set — skipping FMP source');

  const [fmpData, yahooData] = await Promise.all([
    FMP_KEY ? fetchFmpFinancials(companyName) : Promise.resolve(null),
    fetchYahooFinancials(companyName),
  ]);

  rawExtraction.fmp   = fmpData;
  rawExtraction.yahoo = yahooData;

  // Seed from Wikipedia infobox first (lowest priority — overridden by FMP/Yahoo)
  if (wikiData?.figures) {
    figures = mergeFigures(wikiData.figures, figures); // wiki as secondary so FMP/Yahoo override
  }

  // Merge: FMP primary, Yahoo fills any null fields
  if (fmpData?.figures) {
    figures    = mergeFigures(figures, fmpData.figures);
    fiscalYear = fmpData.fiscal_year ?? fiscalYear;
    sourceUrl  = fmpData.source_url ?? null;
    activeSources.push('fmp_api');
  }
  if (yahooData?.figures) {
    figures = mergeFigures(figures, yahooData.figures);
    if (!fiscalYear || fiscalYear === new Date().getFullYear() - 1) {
      fiscalYear = yahooData.fiscal_year ?? fiscalYear;
    }
    if (!sourceUrl) sourceUrl = yahooData.source_url ?? null;
    activeSources.push('yahoo_finance');
  }
  if (wikiData?.figures && isAnyFigure(wikiData.figures) && !activeSources.length) {
    activeSources.push('wikipedia');
    if (!sourceUrl) sourceUrl = wikiData.source_url ?? null;
  }

  // Auto-discover website URL from FMP profile or Wikipedia
  const effectiveWebsiteUrl = websiteUrl ?? fmpData?.website_url ?? null;

  // ── Source 3: IR page via FireCrawl (fallback) ───────────
  let irData: Record<string, any> | null = null;
  if (!isComplete(figures) && !!effectiveWebsiteUrl) {
    irData = await fetchIrPage(effectiveWebsiteUrl!, companyName);
    rawExtraction.ir = irData;
    if (irData?.figures) {
      figures = mergeFigures(figures, irData.figures);
      if (!sourceUrl) sourceUrl = irData.source_url ?? null;
      activeSources.push('ir_page');
    }
  }

  // ── Source 4: Web annual report via FireCrawl search ─────
  let webArData: Record<string, any> | null = null;
  if (!isComplete(figures)) {
    webArData = await fetchWebAnnualReport(companyName);
    rawExtraction.web_annual_report = webArData;
    if (webArData?.figures) {
      figures = mergeFigures(figures, webArData.figures);
      if (!sourceUrl) sourceUrl = webArData.source_url ?? null;
      activeSources.push('web_annual_report');
    }
  }

  const documentType = activeSources.length > 0 ? activeSources.join('+') : 'opencorporates_only';

  // Diagnostics — stored in DB for admin inspection, NOT surfaced in user findings
  rawExtraction._diagnostics = {
    fmp:               FMP_KEY ? (fmpData ? 'ok' : 'no_ticker_found') : 'no_api_key',
    yahoo:             yahooData ? 'ok' : 'scrape_failed_or_no_ticker',
    ir:                effectiveWebsiteUrl ? (irData ? 'ok' : 'scrape_failed') : 'no_website_url',
    web_annual_report: webArData ? 'ok' : 'not_found',
    wikipedia:         wikiData ? 'ok' : 'not_found',
  };

  if (!ocData && !wikiData && !isAnyFigure(figures)) {
    log('warn', 'IntlFinancialScraper', `No data found for "${companyName}" from any source`);
    return null;
  }

  const ratios = computeRatios(figures);
  const data_complete = REQUIRED_FIELDS.every(k => figures[k] !== null);

  return {
    id: null,
    supplier_ico: '',
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

// ── Source 0: Wikipedia ───────────────────────────────────────

async function fetchWikipediaData(companyName: string): Promise<{
  description: string | null;
  figures: FinancialFigures;
  ticker: string | null;
  market_cap: number | null;
  employees: number | null;
  headquarters: string | null;
  founded: string | null;
  source_url: string;
} | null> {
  try {
    const firecrawl = getFireCrawl();
    const slug = companyName.replace(/ /g, '_');
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;

    const result = await firecrawl.scrapeUrl(url, { formats: ['markdown'] });
    if (!result.success || !result.markdown) {
      log('info', 'IntlFinancialScraper', `Wikipedia: no page found for "${companyName}"`);
      return null;
    }

    const aiml = getAIML();
    const response = await aiml.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.0,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a financial analyst. From this Wikipedia article extract:',
            'description (1-2 sentence company overview, plain text, no markdown),',
            'revenue, operating_profit, net_profit, total_assets, equity,',
            'total_liabilities, current_assets, current_liabilities, fiscal_year,',
            'ticker (stock symbol), market_cap, employees (integer), headquarters (city/country), founded (year as string).',
            'Numbers may use commas as thousand separators.',
            'Values may be in millions or billions — normalize to base unit ("$1.2B" = 1200000000, "350 million" = 350000000).',
            'Return JSON with these exact keys. Missing values = null.',
          ].join(' '),
        },
        { role: 'user', content: result.markdown.slice(0, 14000) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const ex = JSON.parse(content);
    const figures: FinancialFigures = {
      revenue:             parseNumber(ex.revenue),
      operating_profit:    parseNumber(ex.operating_profit),
      net_profit:          parseNumber(ex.net_profit),
      total_assets:        parseNumber(ex.total_assets),
      equity:              parseNumber(ex.equity),
      total_liabilities:   parseNumber(ex.total_liabilities),
      current_assets:      parseNumber(ex.current_assets),
      current_liabilities: parseNumber(ex.current_liabilities),
    };

    log('info', 'IntlFinancialScraper', `Wikipedia: extracted data for "${companyName}" — ticker: ${ex.ticker ?? 'none'}`);
    return {
      description:  typeof ex.description === 'string' ? ex.description.trim() : null,
      figures,
      ticker:       ex.ticker   ?? null,
      market_cap:   parseNumber(ex.market_cap),
      employees:    typeof ex.employees === 'number' ? ex.employees : parseNumber(ex.employees) ? Math.round(parseNumber(ex.employees)!) : null,
      headquarters: ex.headquarters ?? null,
      founded:      ex.founded ? String(ex.founded) : null,
      source_url:   url,
    };
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `Wikipedia fetch failed: ${err.message}`);
    return null;
  }
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
): Promise<{
  figures: FinancialFigures;
  fiscal_year: number;
  source_url: string | null;
  website_url: string | null;
  quote: { ticker: string; price: number | null; market_cap: number | null; pe: number | null; change_pct: number | null } | null;
} | null> {
  try {
    // Step 1: Search for ticker using stable search-name endpoint
    const searchRes = await fetch(
      `${FMP_BASE}/search-name?query=${encodeURIComponent(companyName)}&apikey=${FMP_KEY}`
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

    // Step 2: Fetch income statement, balance sheet, profile, and quote in parallel
    const [incomeRes, balanceRes, profileRes, quoteRes] = await Promise.all([
      fetch(`${FMP_BASE}/income-statement?symbol=${ticker}&limit=1&period=annual&apikey=${FMP_KEY}`),
      fetch(`${FMP_BASE}/balance-sheet-statement?symbol=${ticker}&limit=1&period=annual&apikey=${FMP_KEY}`),
      fetch(`${FMP_BASE}/profile?symbol=${ticker}&apikey=${FMP_KEY}`),
      fetch(`${FMP_BASE}/quote?symbol=${ticker}&apikey=${FMP_KEY}`),
    ]);

    if (!incomeRes.ok || !balanceRes.ok) {
      if (incomeRes.status === 429 || balanceRes.status === 429) {
        log('warn', 'IntlFinancialScraper', `FMP rate limit reached (250 req/day)`);
      } else {
        log('warn', 'IntlFinancialScraper', `FMP financials fetch failed for ${ticker}`);
      }
      return null;
    }

    const incomeData  = await incomeRes.json() as any[];
    const balanceData = await balanceRes.json() as any[];
    const income  = incomeData?.[0];
    const balance = balanceData?.[0];

    if (!income && !balance) {
      log('info', 'IntlFinancialScraper', `FMP: returned empty financials for ${ticker}`);
      return null;
    }

    // Profile — website URL
    let website_url: string | null = null;
    if (profileRes.ok) {
      try {
        const profileData = await profileRes.json() as any[];
        // stable API may use websiteUrl; v3 uses website
        website_url = profileData?.[0]?.website ?? profileData?.[0]?.websiteUrl ?? null;
        if (website_url) log('info', 'IntlFinancialScraper', `FMP profile: website ${website_url}`);
      } catch { /* non-fatal */ }
    }

    // Quote — stock price & market cap
    let quote: { ticker: string; price: number | null; market_cap: number | null; pe: number | null; change_pct: number | null } | null = null;
    if (quoteRes.ok) {
      try {
        const quoteData = await quoteRes.json() as any[];
        const q = quoteData?.[0];
        if (q) {
          quote = {
            ticker,
            price:      q.price      ?? null,
            // stable API may use mktCap; v3 uses marketCap
            market_cap: q.marketCap  ?? q.mktCap ?? null,
            pe:         q.pe         ?? q.priceEarningsRatio ?? null,
            // stable API may use changePercentage; v3 uses changesPercentage
            change_pct: q.changesPercentage ?? q.changePercentage ?? null,
          };
          log('info', 'IntlFinancialScraper', `FMP quote: ${ticker} $${q.price} (mkt cap ${fmtLargeNumber(q.marketCap)})`);
        }
      } catch { /* non-fatal */ }
    }

    const figures: FinancialFigures = {
      revenue:             income?.revenue ?? null,
      operating_profit:    income?.operatingIncome ?? null,
      net_profit:          income?.netIncome ?? null,
      total_assets:        balance?.totalAssets ?? null,
      // stable API may use totalEquity; v3 uses totalStockholdersEquity
      equity:              balance?.totalStockholdersEquity ?? balance?.totalEquity ?? balance?.stockholdersEquity ?? null,
      total_liabilities:   balance?.totalLiabilities ?? null,
      current_assets:      balance?.totalCurrentAssets ?? null,
      current_liabilities: balance?.totalCurrentLiabilities ?? null,
    };

    const fiscal_year = parseInt(income?.calendarYear ?? balance?.calendarYear ?? String(new Date().getFullYear() - 1), 10);
    const source_url = `https://financialmodelingprep.com/financial-statements/${ticker}`;

    log('info', 'IntlFinancialScraper', `FMP: got financials for ${ticker} (FY ${fiscal_year})`);
    return { figures, fiscal_year, source_url, website_url, quote };
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `FMP fetch failed: ${err.message}`);
    return null;
  }
}

/** Format large numbers for log output only */
function fmtLargeNumber(n: number | null | undefined): string {
  if (n == null) return 'N/A';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n}`;
}

// ── Source 2b: Yahoo Finance via FireCrawl scraping ──────────

async function fetchYahooFinancials(
  companyName: string
): Promise<{ figures: FinancialFigures; fiscal_year: number; source_url: string | null } | null> {
  try {
    // Find ticker — prefer FMP search (avoids blocked Yahoo API calls)
    let ticker: string | null = null;

    if (FMP_KEY) {
      try {
        const searchRes = await fetch(
          `${FMP_BASE}/search-name?query=${encodeURIComponent(companyName)}&apikey=${FMP_KEY}`
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json() as any[];
          ticker = searchData?.[0]?.symbol ?? null;
          if (ticker) log('info', 'IntlFinancialScraper', `Yahoo Finance: using FMP ticker ${ticker}`);
        }
      } catch { /* non-fatal */ }
    }

    // Fallback ticker discovery via FireCrawl + GPT
    if (!ticker) {
      try {
        const firecrawl = getFireCrawl();
        const lookupResult = await firecrawl.scrapeUrl(
          `https://finance.yahoo.com/lookup?s=${encodeURIComponent(companyName)}`,
          { formats: ['markdown'] }
        );
        if (lookupResult.success && lookupResult.markdown) {
          const aiml = getAIML();
          const tickerResponse = await aiml.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.0,
            max_tokens: 50,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'Extract the stock ticker symbol for the given company from the page text. Return JSON: {"ticker": "SYMBOL"} or {"ticker": null} if not found.' },
              { role: 'user', content: `Company: ${companyName}\n\n${lookupResult.markdown.slice(0, 3000)}` },
            ],
          });
          const tickerContent = tickerResponse.choices[0]?.message?.content;
          if (tickerContent) {
            ticker = JSON.parse(tickerContent)?.ticker ?? null;
            if (ticker) log('info', 'IntlFinancialScraper', `Yahoo Finance: found ticker ${ticker} via lookup`);
          }
        }
      } catch { /* non-fatal */ }
    }

    if (!ticker) {
      log('info', 'IntlFinancialScraper', `Yahoo Finance: no ticker found for "${companyName}"`);
      return null;
    }

    // Scrape Yahoo Finance financials page
    const firecrawl = getFireCrawl();
    const financialsUrl = `https://finance.yahoo.com/quote/${ticker}/financials/`;
    const result = await firecrawl.scrapeUrl(financialsUrl, { formats: ['markdown'] });

    if (!result.success || !result.markdown) {
      log('warn', 'IntlFinancialScraper', `Yahoo Finance: scrape returned no content for ${ticker}`);
      return null;
    }

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
            'Values may be in millions or billions — normalize to base unit ("$1.2B" = 1200000000).',
            'Return a JSON object with these exact keys. Missing values = null.',
          ].join(' '),
        },
        { role: 'user', content: result.markdown.slice(0, 12000) },
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
    const fiscal_year = extracted.fiscal_year ? parseInt(String(extracted.fiscal_year), 10) : new Date().getFullYear() - 1;

    log('info', 'IntlFinancialScraper', `Yahoo Finance: extracted figures for ${ticker} (FY ${fiscal_year})`);
    return { figures, fiscal_year, source_url: financialsUrl };
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `Yahoo Finance fetch failed: ${err.message}`);
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
    let irUrl: string | null = null;

    try {
      const mapped = await firecrawl.mapUrl(websiteUrl, {
        search: 'annual report investor relations financial results financial statements',
        limit: 10,
      });
      const urls: string[] = (mapped as any)?.links ?? (mapped as any)?.urls ?? [];
      irUrl = urls.find((u) =>
        /investor|\/ir\/|annual.report|financial.results|financial.statements|\/financials\/|\/reports\/|about\/financial/i.test(u)
      ) ?? null;
    } catch { /* mapUrl failed */ }

    if (!irUrl) {
      const base = websiteUrl.replace(/\/$/, '');
      irUrl = `${base}/investor-relations`;
    }

    log('info', 'IntlFinancialScraper', `IR page scrape: ${irUrl}`);
    const result = await firecrawl.scrapeUrl(irUrl, { formats: ['markdown'] });
    if (!result.success || !result.markdown) {
      log('warn', 'IntlFinancialScraper', `IR page: no content at ${irUrl}`);
      return null;
    }

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
            'Values may be in millions or billions — normalize to base unit ("$1.2B" = 1200000000).',
            'Return a JSON object with these exact keys. Missing values = null.',
          ].join(' '),
        },
        { role: 'user', content: result.markdown.slice(0, 12000) },
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

// ── Source 4: Web annual report search via FireCrawl ─────────

async function fetchWebAnnualReport(
  companyName: string
): Promise<{ figures: FinancialFigures; source_url: string | null } | null> {
  try {
    const firecrawl = getFireCrawl();
    log('info', 'IntlFinancialScraper', `Web annual report search for "${companyName}"`);

    const searchResult = await (firecrawl as any).search(
      `"${companyName}" annual report financial statements`, { limit: 3 }
    );
    const results: any[] = searchResult?.data ?? searchResult?.results ?? [];
    if (!results.length) return null;

    const aiml = getAIML();
    for (const item of results) {
      const url: string = item?.url ?? item?.link ?? '';
      if (!url) continue;
      try {
        const scraped = await firecrawl.scrapeUrl(url, { formats: ['markdown'] });
        if (!scraped.success || !scraped.markdown) continue;

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
                'Values may be in millions or billions — normalize to base unit ("$1.2B" = 1200000000).',
                'Return a JSON object with these exact keys. Missing values = null.',
              ].join(' '),
            },
            { role: 'user', content: scraped.markdown.slice(0, 12000) },
          ],
        });

        const content = response.choices[0]?.message?.content;
        if (!content) continue;

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

        if (isAnyFigure(figures)) {
          log('info', 'IntlFinancialScraper', `Web annual report: extracted figures from ${url}`);
          return { figures, source_url: url };
        }
      } catch { /* try next */ }
    }

    log('info', 'IntlFinancialScraper', `Web annual report: no usable data for "${companyName}"`);
    return null;
  } catch (err: any) {
    log('error', 'IntlFinancialScraper', `Web annual report search failed: ${err.message}`);
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

function mergeFigures(primary: FinancialFigures, secondary: FinancialFigures): FinancialFigures {
  const result = { ...primary };
  for (const key of Object.keys(secondary) as (keyof FinancialFigures)[]) {
    if (result[key] === null && secondary[key] !== null) result[key] = secondary[key];
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

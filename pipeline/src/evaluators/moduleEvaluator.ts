import { getSupabase, getAIML, getFireCrawl } from '../utils/clients';
import { log } from '../utils/helpers';
import { lookupCompanyByICO } from '../scrapers/ares';
import { checkInsolvency } from '../scrapers/insolvency';
import { checkEnergyLicenses } from '../scrapers/energy';
import { scrapeNewsForSupplier } from '../scrapers/firecrawl-scraper';
import { scrapeFinancialData } from '../scrapers/financial-scraper';
import { scrapeInternationalFinancialData, fetchOpenCorporates } from '../scrapers/international-financial-scraper';
import type { OpenCorporatesResult } from '../scrapers/international-financial-scraper';
import { checkSanctionsList } from '../scrapers/sanctions-scraper';
import { getFinancialSnapshot, saveFinancialSnapshot, linkEvaluationToSnapshot } from '../utils/financial-storage';
import { generateModuleSummary } from '../utils/ai-summarizer';
import type { AresCompanyData, InsolvencyRecord, EnergyLicenseData, ScrapedArticle, FinancialSnapshot } from '../types';

// ============================================================
// Types
// ============================================================

interface ModuleResult {
  score: number;                              // 0-100
  risk_level: string;                         // low | medium | high | critical
  summary: string;
  findings: string[];
  sources: { url: string; title: string }[];
  raw_data: Record<string, any>;
}

// ============================================================
// Entry point — called once per module per evaluation
// ============================================================

export async function runModule(
  evaluationId: string,
  moduleType: string,
  ico: string,
  companyName: string,
  country: string = '',
  websiteUrl: string = '',
  prefetchedArticles: ScrapedArticle[] = []
): Promise<void> {
  const supabase = getSupabase();

  // Mark module as running
  await supabase
    .from('evaluation_modules')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('evaluation_id', evaluationId)
    .eq('module_type', moduleType);

  log('info', 'Evaluator', `Running module "${moduleType}" for ${companyName} (${ico})`);

  try {
    let result: ModuleResult;

    switch (moduleType) {
      case 'financial':
        result = await evaluateFinancial(evaluationId, ico, companyName, country, websiteUrl);
        break;
      case 'compliance':
        result = await evaluateCompliance(ico, companyName, country);
        break;
      case 'sanctions':
        result = await evaluateSanctions(ico, companyName, country, prefetchedArticles);
        break;
      case 'market':
        result = await evaluateMarket(ico, companyName, prefetchedArticles);
        break;
      case 'esg':
        result = await evaluateESG(ico, companyName, prefetchedArticles);
        break;
      case 'cyber':
        result = await evaluateCyber(ico, companyName, prefetchedArticles);
        break;
      case 'internal':
        result = evaluateInternal();
        break;
      default:
        throw new Error(`Unknown module type: ${moduleType}`);
    }

    await supabase
      .from('evaluation_modules')
      .update({
        status: 'completed',
        score: result.score,
        risk_level: result.risk_level,
        summary: result.summary,
        findings: result.findings,
        sources: result.sources,
        raw_data: result.raw_data,
        completed_at: new Date().toISOString(),
      })
      .eq('evaluation_id', evaluationId)
      .eq('module_type', moduleType);

    log('info', 'Evaluator', `Module "${moduleType}" completed — score: ${result.score}`);
  } catch (err: any) {
    log('error', 'Evaluator', `Module "${moduleType}" failed: ${err.message}`);
    await supabase
      .from('evaluation_modules')
      .update({
        status: 'failed',
        summary: `Evaluation failed: ${err.message}`,
        completed_at: new Date().toISOString(),
      })
      .eq('evaluation_id', evaluationId)
      .eq('module_type', moduleType);
    throw err;
  }
}

// ============================================================
// Module: Financial Health
// Data sources: ARES (company fundamentals) + Sbírka listin (financial statements)
//
// Determinism: each evaluation is linked to the exact snapshot that produced its score.
// Cache: if a snapshot < 90 days old exists, it is reused (no re-scrape).
// Fallback: if no financial statement data is available, ARES-only scoring applies.
// ============================================================

async function evaluateFinancial(
  evaluationId: string,
  ico: string,
  companyName: string,
  country: string = '',
  websiteUrl: string = ''
): Promise<ModuleResult> {
  // Non-Czech companies have no IČO — use dedicated international data sources
  if (!ico) {
    return evaluateFinancialInternational(evaluationId, companyName, country, websiteUrl);
  }

  const ares = await lookupCompanyByICO(ico);

  if (!ares) {
    return {
      score: 50,
      risk_level: 'medium',
      summary: `No ARES record found for IČO ${ico}. Company may not be registered in the Czech Business Register.`,
      findings: [`IČO ${ico} was not found in the ARES database.`],
      sources: [{ url: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, title: 'ARES Czech Business Register' }],
      raw_data: {},
    };
  }

  // --- Snapshot: cache check or fresh scrape ---
  let snapshot: FinancialSnapshot | null = await getFinancialSnapshot(ico, 90);

  if (!snapshot) {
    log('info', 'Evaluator', `No cached snapshot for ${ico} — scraping financial statements`);
    snapshot = await scrapeFinancialData(ico, companyName, ares.financial_statements_url);

    if (snapshot) {
      const snapshotId = await saveFinancialSnapshot(snapshot);
      if (snapshotId) {
        snapshot = { ...snapshot, id: snapshotId };
      }
    }
  } else {
    log('info', 'Evaluator', `Using cached financial snapshot for ${ico} (fiscal year ${snapshot.fiscal_year})`);
  }

  // Link this evaluation to the snapshot so the score is permanently traceable
  if (snapshot?.id) {
    await linkEvaluationToSnapshot(evaluationId, snapshot.id);
  }

  // --- Deterministic scoring ---
  const { score, scoreBreakdown, findings, sources } = computeFinancialScore(ares, snapshot);

  const aiSummary = await generateModuleSummary('financial', ares.company_name, score, scoreToRisk(score), findings, false);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Financial Health', score, ares.company_name,
      snapshot?.data_complete
        ? `fiscal year ${snapshot.fiscal_year} financial data`
        : 'ARES registry data only'),
    findings,
    sources,
    raw_data: {
      snapshot_id:     snapshot?.id ?? null,
      fiscal_year:     snapshot?.fiscal_year ?? null,
      data_complete:   snapshot?.data_complete ?? false,
      source_url:      snapshot?.source_url ?? null,
      figures:         snapshot?.figures ?? null,
      ratios:          snapshot?.ratios ?? null,
      score_breakdown: scoreBreakdown,
      fallback_mode:   !snapshot,
      ares,
    },
  };
}

// ============================================================
// International financial evaluation
// Uses OpenCorporates + FMP API + IR page (see international-financial-scraper.ts)
// Same snapshot-based determinism as the Czech path.
// ============================================================

async function evaluateFinancialInternational(
  evaluationId: string,
  companyName: string,
  country: string,
  websiteUrl: string
): Promise<ModuleResult> {
  // Cache check using synthetic INT_ key
  let snapshot: FinancialSnapshot | null = await getFinancialSnapshot('', 90, companyName);

  if (!snapshot) {
    log('info', 'Evaluator', `No cached snapshot for international company "${companyName}" — scraping`);
    snapshot = await scrapeInternationalFinancialData(companyName, country, websiteUrl || null);

    if (snapshot) {
      const snapshotId = await saveFinancialSnapshot(snapshot);
      if (snapshotId) {
        snapshot = { ...snapshot, id: snapshotId };
      }
    }
  } else {
    log('info', 'Evaluator', `Using cached financial snapshot for "${companyName}" (fiscal year ${snapshot.fiscal_year})`);
  }

  if (snapshot?.id) {
    await linkEvaluationToSnapshot(evaluationId, snapshot.id);
  }

  const { score, scoreBreakdown, findings, sources } = computeInternationalScore(snapshot, companyName, country);

  const aiSummary = await generateModuleSummary('financial', companyName, score, scoreToRisk(score), findings, true);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Financial Health', score, companyName,
      snapshot?.data_complete
        ? `fiscal year ${snapshot.fiscal_year} international financial data`
        : snapshot ? 'registration data only' : 'no data available'),
    findings,
    sources,
    raw_data: {
      international:   true,
      snapshot_id:     snapshot?.id ?? null,
      fiscal_year:     snapshot?.fiscal_year ?? null,
      data_complete:   snapshot?.data_complete ?? false,
      source_url:      snapshot?.source_url ?? null,
      figures:         snapshot?.figures ?? null,
      ratios:          snapshot?.ratios ?? null,
      score_breakdown: scoreBreakdown,
      fallback_mode:   !snapshot,
    },
  };
}

/**
 * Score an international company using OpenCorporates registration data + financial ratios.
 * Same 4-component weighted formula as Czech path; company health uses OpenCorporates instead of ARES.
 */
function computeInternationalScore(
  snapshot: FinancialSnapshot | null,
  companyName: string,
  country: string
): {
  score: number;
  scoreBreakdown: Record<string, any>;
  findings: string[];
  sources: { url: string; title: string }[];
} {
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  const ocData   = (snapshot?.raw_extraction?.opencorporates ?? null) as OpenCorporatesResult | null;
  const wikiData = (snapshot?.raw_extraction?.wikipedia ?? null) as Record<string, any> | null;
  const fmpQuote = (snapshot?.raw_extraction?.fmp?.quote ?? null) as Record<string, any> | null;

  // Human-readable label for the financial data source(s)
  const docType = snapshot?.document_type ?? '';
  const sourceLabel = docType
    ? docType
        .replace('fmp_api',             'Financial Modeling Prep')
        .replace('yahoo_finance',       'Yahoo Finance')
        .replace('ir_page',             'IR page')
        .replace('web_annual_report',   'web annual report')
        .replace('wikipedia',           'Wikipedia')
        .replace('opencorporates_only', 'OpenCorporates')
        .replace(/\+/g, ' + ')
    : 'unknown';

  // ── Company overview (Wikipedia) ─────────────────────────────
  if (wikiData?.description) {
    findings.push(wikiData.description);
  }
  if (wikiData?.headquarters || wikiData?.founded || wikiData?.employees) {
    const parts: string[] = [];
    if (wikiData.founded)      parts.push(`founded ${wikiData.founded}`);
    if (wikiData.headquarters) parts.push(`headquartered in ${wikiData.headquarters}`);
    if (wikiData.employees)    parts.push(`${Number(wikiData.employees).toLocaleString()} employees`);
    findings.push(`${parts.join(', ')}.`);
    if (wikiData.source_url) sources.push({ url: wikiData.source_url, title: `${companyName} — Wikipedia` });
  }

  // ── Stock market data (FMP quote) ────────────────────────────
  if (fmpQuote) {
    const ticker     = fmpQuote.ticker ?? '';
    const price      = fmpQuote.price      != null ? `$${Number(fmpQuote.price).toFixed(2)}`         : null;
    const marketCap  = fmpQuote.market_cap != null ? fmtBigNumber(fmpQuote.market_cap)               : null;
    const pe         = fmpQuote.pe         != null ? `P/E ${Number(fmpQuote.pe).toFixed(1)}`         : null;
    const change     = fmpQuote.change_pct != null
      ? `${fmpQuote.change_pct >= 0 ? '+' : ''}${Number(fmpQuote.change_pct).toFixed(2)}%`
      : null;
    const parts = [ticker, price, marketCap, pe, change].filter(Boolean);
    if (parts.length) findings.push(`Stock: ${parts.join(' | ')} (Source: Financial Modeling Prep)`);
    if (snapshot?.source_url) {
      sources.push({ url: snapshot.source_url, title: `${ticker} — Financial Modeling Prep` });
    }
  }

  // ── Component 1: Profitability (profit_margin) ────────────────
  const profitMargin = snapshot?.ratios.profit_margin ?? null;
  let profScore: number;
  if (profitMargin === null)        profScore = 50;
  else if (profitMargin >= 0.10)    profScore = 100;
  else if (profitMargin >= 0.05)    profScore = 75;
  else if (profitMargin >= 0.01)    profScore = 50;
  else if (profitMargin >= 0)       profScore = 30;
  else                              profScore = 10;

  if (snapshot?.figures.net_profit != null && snapshot?.figures.revenue != null) {
    const pct = profitMargin !== null ? (profitMargin * 100).toFixed(1) : 'N/A';
    const interpretation = profitMargin === null ? '' : profitMargin >= 0.10 ? ' — strong profitability.' : profitMargin >= 0.05 ? ' — healthy margin.' : profitMargin >= 0.01 ? ' — thin margin.' : profitMargin >= 0 ? ' — near breakeven.' : ' — operating at a loss.';
    findings.push(`Revenue: ${fmtNumber(snapshot.figures.revenue)} | Net profit: ${fmtNumber(snapshot.figures.net_profit)} | Profit margin: ${pct}%${interpretation} (FY ${snapshot.fiscal_year}, Source: ${sourceLabel})`);
  }

  // ── Component 2: Liquidity (current_ratio) ───────────────────
  const currentRatio = snapshot?.ratios.current_ratio ?? null;
  let liqScore: number;
  if (currentRatio === null)        liqScore = 50;
  else if (currentRatio >= 2.0)     liqScore = 100;
  else if (currentRatio >= 1.5)     liqScore = 80;
  else if (currentRatio >= 1.0)     liqScore = 55;
  else if (currentRatio >= 0.5)     liqScore = 30;
  else                              liqScore = 10;

  if (currentRatio !== null) {
    const liqNote = currentRatio >= 2.0 ? 'strong liquidity.' : currentRatio >= 1.5 ? 'adequate liquidity.' : currentRatio >= 1.0 ? 'acceptable liquidity.' : 'potential short-term liquidity concern.';
    findings.push(`Current ratio: ${currentRatio.toFixed(2)} — ${liqNote}`);
  }

  // ── Component 3: Solvency (equity_ratio) ─────────────────────
  const equityRatio = snapshot?.ratios.equity_ratio ?? null;
  let solScore: number;
  if (equityRatio === null)         solScore = 50;
  else if (equityRatio >= 0.50)     solScore = 100;
  else if (equityRatio >= 0.30)     solScore = 75;
  else if (equityRatio >= 0.10)     solScore = 50;
  else if (equityRatio >= 0.00)     solScore = 30;
  else                              solScore = 5;

  if (equityRatio !== null) {
    const solNote = equityRatio >= 0.50 ? 'strong balance sheet.' : equityRatio >= 0.30 ? 'moderate leverage.' : equityRatio >= 0.10 ? 'highly leveraged.' : equityRatio < 0 ? 'liabilities exceed assets — elevated risk.' : 'very high leverage.';
    findings.push(`Equity ratio: ${(equityRatio * 100).toFixed(1)}% — ${solNote}`);
  }

  // ── Component 4: Company health (OpenCorporates / Wikipedia) ─
  let healthScore: number;
  if (!ocData) {
    healthScore = 40;
    // Only add registry note if we don't already have good company info from Wikipedia
    if (!wikiData?.description) {
      findings.push(`Company registration status could not be verified for ${companyName}${country ? ` (${country.toUpperCase()})` : ''}.`);
    }
    sources.push({ url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – International Business Registry' });
  } else if (ocData.status === 'dissolved') {
    healthScore = 10;
    findings.push('Company has been dissolved or struck off — critical financial risk.');
  } else if (ocData.status === 'inactive') {
    healthScore = 20;
    findings.push('Company is currently inactive per OpenCorporates registry.');
  } else {
    const yearsOld = ocData.years_old;
    if (ocData.status === 'unknown') {
      healthScore = 40;
    } else if (yearsOld === null)  healthScore = 65;
    else if (yearsOld >= 10)       healthScore = 100;
    else if (yearsOld >= 5)        healthScore = 80;
    else if (yearsOld >= 2)        healthScore = 65;
    else                           healthScore = 50;

    if (ocData.status === 'active' && ocData.incorporation_date) {
      findings.push(`Actively registered company${ocData.jurisdiction ? ` (${ocData.jurisdiction.toUpperCase()})` : ''}, incorporated ${ocData.incorporation_date.slice(0, 10)}${ocData.years_old != null ? ` — ${ocData.years_old} years in operation.` : '.'}`);
    } else if (ocData.status === 'active') {
      findings.push(`Actively registered company${ocData.jurisdiction ? ` in ${ocData.jurisdiction.toUpperCase()}` : ''}.`);
    }
    if (ocData.company_type) findings.push(`Legal form: ${ocData.company_type}.`);
    sources.push({ url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – Company Registry' });
  }

  // ── Data completeness note ────────────────────────────────────
  if (!snapshot) {
    findings.push('No financial data could be retrieved for this company. Registration status and qualitative data only.');
  } else if (!snapshot.data_complete) {
    findings.push(`Financial data partially available (FY ${snapshot.fiscal_year}) — not all ratios could be computed.`);
  }

  const score = clamp(
    Math.round(profScore * 0.30 + liqScore * 0.25 + solScore * 0.20 + healthScore * 0.25),
    0, 100
  );

  const scoreBreakdown = {
    profitability:  { score: profScore,   weight: 0.30, value: profitMargin },
    liquidity:      { score: liqScore,    weight: 0.25, value: currentRatio },
    solvency:       { score: solScore,    weight: 0.20, value: equityRatio },
    company_health: { score: healthScore, weight: 0.25, oc_status: ocData?.status ?? null, years_old: ocData?.years_old ?? null },
  };

  return { score, scoreBreakdown, findings, sources };
}

/**
 * Compute the financial score as a weighted average of four components.
 * Pure function — same inputs always produce the same output.
 *
 * Weights:
 *   Profitability  30%  (profit_margin)
 *   Liquidity      25%  (current_ratio)
 *   Solvency       20%  (equity_ratio)
 *   Company health 25%  (ARES status + registration age)
 */
function computeFinancialScore(
  ares: AresCompanyData,
  snapshot: FinancialSnapshot | null
): {
  score: number;
  scoreBreakdown: Record<string, any>;
  findings: string[];
  sources: { url: string; title: string }[];
} {
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [
    { url: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ares.ico}`, title: 'ARES – Czech Business Register' },
  ];

  // ── Component 1: Profitability (profit_margin) ────────────────────────
  const profitMargin = snapshot?.ratios.profit_margin ?? null;
  let profScore: number;
  if (profitMargin === null)        profScore = 50;
  else if (profitMargin >= 0.10)    profScore = 100;
  else if (profitMargin >= 0.05)    profScore = 75;
  else if (profitMargin >= 0.01)    profScore = 50;
  else if (profitMargin >= 0)       profScore = 30;
  else                              profScore = 10;

  if (snapshot != null && snapshot.figures.net_profit !== null && snapshot.figures.revenue !== null) {
    const pct = profitMargin !== null ? (profitMargin * 100).toFixed(1) : 'N/A';
    const interpretation = profitMargin === null ? '' : profitMargin >= 0.10 ? ' — strong profitability.' : profitMargin >= 0.05 ? ' — healthy margin.' : profitMargin >= 0.01 ? ' — thin margin.' : profitMargin >= 0 ? ' — near breakeven.' : ' — operating at a loss.';
    findings.push(`Profit margin: ${pct}%${interpretation} (Revenue: ${fmtNumber(snapshot.figures.revenue)} / Net profit: ${fmtNumber(snapshot.figures.net_profit)} CZK thousands, FY ${snapshot.fiscal_year})`);
  } else if (snapshot && !snapshot.data_complete) {
    findings.push('Profitability data not available in public financial statements — neutral score applied.');
  }

  // ── Component 2: Liquidity (current_ratio) ───────────────────────────
  const currentRatio = snapshot?.ratios.current_ratio ?? null;
  let liqScore: number;
  if (currentRatio === null)        liqScore = 50;
  else if (currentRatio >= 2.0)     liqScore = 100;
  else if (currentRatio >= 1.5)     liqScore = 80;
  else if (currentRatio >= 1.0)     liqScore = 55;
  else if (currentRatio >= 0.5)     liqScore = 30;
  else                              liqScore = 10;

  if (currentRatio !== null) {
    const liqNote = currentRatio >= 2.0 ? 'strong liquidity.' : currentRatio >= 1.5 ? 'adequate liquidity.' : currentRatio >= 1.0 ? 'acceptable liquidity.' : 'potential short-term liquidity concern.';
    findings.push(`Current ratio: ${currentRatio.toFixed(2)} — ${liqNote} (FY ${snapshot?.fiscal_year ?? 'N/A'})`);
  }

  // ── Component 3: Solvency (equity_ratio) ─────────────────────────────
  const equityRatio = snapshot?.ratios.equity_ratio ?? null;
  let solScore: number;
  if (equityRatio === null)         solScore = 50;
  else if (equityRatio >= 0.50)     solScore = 100;
  else if (equityRatio >= 0.30)     solScore = 75;
  else if (equityRatio >= 0.10)     solScore = 50;
  else if (equityRatio >= 0.00)     solScore = 30;
  else                              solScore = 5;

  if (equityRatio !== null) {
    const solNote = equityRatio >= 0.50 ? 'strong balance sheet.' : equityRatio >= 0.30 ? 'moderate leverage.' : equityRatio >= 0.10 ? 'highly leveraged.' : equityRatio < 0 ? 'liabilities exceed assets — elevated insolvency risk.' : 'very high leverage.';
    findings.push(`Equity ratio: ${(equityRatio * 100).toFixed(1)}% — ${solNote} (FY ${snapshot?.fiscal_year ?? 'N/A'})`);
  }

  // ── Component 4: Company health (ARES status + age) ──────────────────
  const yearsOld = ares.registration_date
    ? (Date.now() - new Date(ares.registration_date).getTime()) / (1000 * 60 * 60 * 24 * 365)
    : null;

  let healthScore: number;
  if (ares.status === 'in_liquidation') {
    healthScore = 10;
    findings.push('Company is in liquidation — significant financial risk.');
  } else if (ares.status === 'inactive') {
    healthScore = 20;
    findings.push('Company is inactive in the ARES registry.');
  } else {
    // active
    if (yearsOld === null)          healthScore = 65;
    else if (yearsOld >= 10)        healthScore = 100;
    else if (yearsOld >= 5)         healthScore = 80;
    else if (yearsOld >= 2)         healthScore = 65;
    else                            healthScore = 50;

    findings.push(`Company is actively registered: ${ares.company_name}. (Source: ARES Czech Business Register)`);
    if (yearsOld !== null) {
      findings.push(`Registered since ${ares.registration_date.slice(0, 10)} (${Math.floor(yearsOld)} years). (Source: ARES)`);
    }
  }

  if (ares.legal_form)  findings.push(`Legal form: ${ares.legal_form}.`);
  if (ares.address)     findings.push(`Registered address: ${ares.address}.`);
  if (ares.business_activities.length > 0) {
    findings.push(`Business activities: ${ares.business_activities.slice(0, 3).join('; ')}.`);
  }

  // Financial statements source link
  if (ares.financial_statements_url) {
    sources.push({ url: ares.financial_statements_url, title: 'Sbírka listin – Financial Statements' });
  }
  if (snapshot?.source_url) {
    sources.push({ url: snapshot.source_url, title: `Účetní závěrka ${snapshot.fiscal_year}` });
  }

  if (!snapshot) {
    findings.push('No financial statement data available — ARES-only assessment applied.');
  } else if (!snapshot.data_complete) {
    findings.push('Partial financial data extracted — some ratios could not be computed.');
  } else {
    findings.push(`Financial data from fiscal year ${snapshot.fiscal_year} — complete extraction.`);
  }

  // ── Weighted total ────────────────────────────────────────────────────
  const score = clamp(
    Math.round(profScore * 0.30 + liqScore * 0.25 + solScore * 0.20 + healthScore * 0.25),
    0, 100
  );

  const scoreBreakdown = {
    profitability:  { score: profScore,   weight: 0.30, value: profitMargin },
    liquidity:      { score: liqScore,    weight: 0.25, value: currentRatio },
    solvency:       { score: solScore,    weight: 0.20, value: equityRatio },
    company_health: { score: healthScore, weight: 0.25, ares_status: ares.status, years_old: yearsOld ? Math.floor(yearsOld) : null },
  };

  return { score, scoreBreakdown, findings, sources };
}

/** Format a financial number for display (rounds to integer, adds thousands separator). */
function fmtNumber(n: number | null): string {
  if (n === null) return 'N/A';
  return Math.round(n).toLocaleString('cs-CZ');
}

/** Format large numbers as $2.1T, $350.4B, $1.2M etc. */
function fmtBigNumber(n: number | null): string {
  if (n == null) return 'N/A';
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

// ============================================================
// Module: Compliance & Legal
// CZ:  ARES (registration status) + ISIR (insolvency proceedings)
// Intl: OpenCorporates (registration) + FireCrawl web search for
//       regulatory violations, fines, court judgments (AI extraction)
// ============================================================

async function evaluateCompliance(ico: string, companyName: string, country: string = ''): Promise<ModuleResult> {
  if (!ico) {
    return evaluateComplianceInternational(companyName, country);
  }

  const [ares, insolvency] = await Promise.all([
    lookupCompanyByICO(ico),
    checkInsolvency(ico),
  ]);

  let score = 90;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [
    { url: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, title: 'ARES – Czech Business Register' },
    { url: `https://isir.justice.cz/isir/ueu/vysledek_lustrace.do?ic=${ico}&typ=ic`, title: 'ISIR – Czech Insolvency Register' },
  ];

  // ARES status
  if (ares) {
    if (ares.status === 'in_liquidation') {
      score -= 30;
      findings.push(`⚠️ Company is in liquidation — contract execution risk.`);
    } else if (ares.status === 'inactive') {
      score -= 20;
      findings.push(`⚠️ Company is inactive per ARES — may not be legally permitted to operate.`);
    } else {
      findings.push(`Company is active and properly registered in the Czech Business Register (ARES).`);
      if (ares.registration_date) {
        const yearsOld = Math.floor((Date.now() - new Date(ares.registration_date).getTime()) / (1000 * 60 * 60 * 24 * 365));
        findings.push(`Registered since ${ares.registration_date.slice(0, 10)} — ${yearsOld} years in operation.`);
      }
    }
  } else {
    score -= 15;
    findings.push(`Company not found in ARES — registration status unknown.`);
  }

  // Insolvency records — legal impediment to contract execution
  if (insolvency.length === 0) {
    findings.push('No insolvency proceedings found in Czech Insolvency Register (ISIR).');
    score += 5;
  } else {
    const active = insolvency.filter((r) => r.status === 'active');
    const resolved = insolvency.filter((r) => r.status !== 'active');

    if (active.length > 0) {
      score -= active.length * 40;
      findings.push(`🔴 ${active.length} active insolvency proceeding(s): ${active.map((r) => r.case_number).join(', ')} — contracts may be void or unenforceable.`);
    }
    if (resolved.length > 0) {
      score -= resolved.length * 10;
      findings.push(`${resolved.length} resolved insolvency proceeding(s) on record: ${resolved.map((r) => r.case_number).join(', ')}`);
    }
  }

  score = clamp(score, 0, 100);

  const aiSummary = await generateModuleSummary('compliance', companyName, score, scoreToRisk(score), findings, false);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Compliance & Legal', score, companyName, insolvency.length === 0 ? 'clean' : 'issues found'),
    findings,
    sources,
    raw_data: { ares, insolvency },
  };
}

async function evaluateComplianceInternational(companyName: string, country: string): Promise<ModuleResult> {
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  // ── Step 1: OpenCorporates registration check ─────────────
  const ocData = await fetchOpenCorporates(companyName, country);

  let score = 75;

  if (!ocData) {
    score = 60;
    findings.push('Company registration status could not be verified via international registries.');
    sources.push({ url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – International Business Registry' });
  } else if (ocData.status === 'dissolved') {
    score = 20;
    findings.push('🔴 Company has been dissolved or struck off — contracting is not recommended.');
    sources.push({ url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – Company Registry' });
  } else if (ocData.status === 'inactive') {
    score = 50;
    findings.push('⚠️ Company is currently inactive per OpenCorporates registry — verify ability to contract.');
    sources.push({ url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – Company Registry' });
  } else {
    const yearsOld = ocData.years_old;
    if (ocData.status === 'unknown') {
      score = 60;
      findings.push(`Company found in OpenCorporates but status is unconfirmed${ocData.jurisdiction ? ` (${ocData.jurisdiction.toUpperCase()})` : ''}.`);
    } else {
      // active
      if (yearsOld === null)      score = 70;
      else if (yearsOld >= 10)    score = 85;
      else if (yearsOld >= 5)     score = 78;
      else if (yearsOld >= 2)     score = 72;
      else                        score = 65;

      findings.push(`Actively registered company${ocData.jurisdiction ? ` (${ocData.jurisdiction.toUpperCase()})` : ''}${yearsOld !== null ? ` — ${yearsOld} years in operation.` : '.'}`);
    }
    if (ocData.company_type) findings.push(`Legal form: ${ocData.company_type}.`);
    if (ocData.incorporation_date) findings.push(`Incorporated: ${ocData.incorporation_date.slice(0, 10)}.`);
    sources.push({ url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: `${companyName} — OpenCorporates` });
  }

  // ── Step 2: Web search for regulatory violations / fines ──
  const complianceWeb = await scrapeComplianceWebIssues(companyName, country);

  if (complianceWeb.violations.length > 0) {
    const active = complianceWeb.violations.filter((v) => !v.resolved);
    const resolved = complianceWeb.violations.filter((v) => v.resolved);

    if (active.length > 0) {
      score -= Math.min(active.length * 15, 30);
      for (const v of active.slice(0, 3)) {
        findings.push(`⚠️ ${v.type}${v.year ? ` (${v.year})` : ''}: ${v.description.slice(0, 150)}`);
      }
    }
    if (resolved.length > 0) {
      score -= Math.min(resolved.length * 5, 15);
      findings.push(`${resolved.length} resolved compliance issue(s) found in public records.`);
    }
    for (const src of complianceWeb.sources) sources.push(src);
  } else {
    findings.push('No material compliance violations found in publicly available sources.');
  }

  score = clamp(score, 0, 100);

  const aiSummary = await generateModuleSummary('compliance', companyName, score, scoreToRisk(score), findings, true);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Compliance & Legal', score, companyName,
      complianceWeb.violations.length === 0 ? 'no violations found' : 'compliance issues found'),
    findings,
    sources,
    raw_data: {
      international: true,
      opencorporates: ocData,
      compliance_violations: complianceWeb.violations,
      recommendations: [
        'Verify registration in the national business registry of the country of incorporation.',
        'Review local court records for pending litigation.',
      ],
    },
  };
}

/**
 * Use FireCrawl search to find regulatory compliance issues about an international company.
 * AI extracts structured violation data from the scraped pages.
 */
async function scrapeComplianceWebIssues(
  companyName: string,
  country: string
): Promise<{
  violations: Array<{ type: string; description: string; year: string | null; resolved: boolean }>;
  sources: Array<{ url: string; title: string }>;
}> {
  const violations: Array<{ type: string; description: string; year: string | null; resolved: boolean }> = [];
  const srcs: Array<{ url: string; title: string }> = [];

  try {
    const firecrawl = getFireCrawl();
    const query = `"${companyName}" regulatory fine OR violation OR lawsuit OR court judgment OR license revoked${country ? ` ${country}` : ''}`;

    // FireCrawl search returns pages matching the query
    const searchResult = await (firecrawl as any).search(query, {
      limit: 5,
      scrapeOptions: { formats: ['markdown'] },
    });

    const docs: any[] = searchResult?.data ?? searchResult?.results ?? [];
    if (!docs.length) {
      log('info', 'Evaluator', `Compliance web search: no results for "${companyName}"`);
      return { violations: [], sources: [] };
    }

    const aiml = getAIML();

    for (const doc of docs.slice(0, 5)) {
      const content = (doc.markdown ?? doc.description ?? '').slice(0, 5000);
      if (!content.trim()) continue;

      try {
        const response = await aiml.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.0,
          max_tokens: 400,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are a legal compliance analyst. Given web content about a company, extract any mentions of ' +
                'regulatory violations, government fines, court judgments, license revocations, or anti-trust investigations. ' +
                'Return JSON: { violations: [{type: string, description: string (max 200 chars), year: string|null, resolved: boolean}] }. ' +
                'Only include violations that clearly name the target company. If none found, return { violations: [] }.',
            },
            { role: 'user', content: `Company: ${companyName}\n\n${content}` },
          ],
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{"violations":[]}');
        const docViolations: any[] = parsed.violations ?? [];

        for (const v of docViolations) {
          violations.push({
            type:        String(v.type ?? 'Violation'),
            description: String(v.description ?? '').slice(0, 200),
            year:        v.year ? String(v.year) : null,
            resolved:    Boolean(v.resolved),
          });
        }

        if (docViolations.length > 0 && doc.url) {
          srcs.push({ url: doc.url, title: doc.metadata?.title ?? doc.title ?? doc.url });
        }
      } catch {
        // Skip docs where AI extraction fails
      }
    }
  } catch (err: any) {
    log('warn', 'Evaluator', `Compliance web scrape failed for "${companyName}": ${err.message}`);
  }

  return { violations, sources: srcs };
}

// ============================================================
// Module: Sanction Risks
// Primary: OpenSanctions API (EU, OFAC, UN, 100+ lists)
// Secondary: sanctions-tagged news articles
// Note: ISIR insolvency check belongs in Compliance, not here.
// ============================================================

async function evaluateSanctions(
  ico: string,
  companyName: string,
  country: string = '',
  prefetchedArticles: ScrapedArticle[] = []
): Promise<ModuleResult> {
  const sanctionNews = prefetchedArticles.filter((a) => a.tags.includes('sanctions'));

  let score = 90;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  // ── Primary: OpenSanctions API ────────────────────────────
  const sanctionsResult = await checkSanctionsList(companyName, country || undefined);

  if (!sanctionsResult.api_available) {
    findings.push('Automated sanctions database check unavailable — news-based screening only.');
    sources.push({ url: 'https://www.sanctionsmap.eu/', title: 'EU Sanctions Map' });
    sources.push({ url: 'https://sanctionssearch.ofac.treas.gov/', title: 'OFAC Sanctions Search' });
  } else {
    const listsText = sanctionsResult.lists_checked_labels.slice(0, 4).join(', ');
    const strongMatches = sanctionsResult.matches.filter((m) => m.match_score >= 0.70);
    const possibleMatches = sanctionsResult.matches.filter((m) => m.match_score >= 0.50 && m.match_score < 0.70);

    if (strongMatches.length > 0) {
      score = 0;
      for (const m of strongMatches) {
        const lists = m.dataset_labels.join(', ');
        findings.push(`🔴 SANCTIONS MATCH: "${m.entity_name}" found on ${lists} (confidence: ${Math.round(m.match_score * 100)}%). Contracting may be illegal.`);
      }
    } else if (possibleMatches.length > 0) {
      score -= possibleMatches.length * 40;
      for (const m of possibleMatches) {
        const lists = m.dataset_labels.join(', ');
        findings.push(`⚠️ Possible sanctions match: "${m.entity_name}" on ${lists} (confidence: ${Math.round(m.match_score * 100)}%) — manual review required.`);
      }
    } else {
      findings.push(`Screened against ${listsText} — no sanctions matches found.`);
    }

    sources.push({ url: 'https://www.opensanctions.org/', title: 'OpenSanctions – Aggregated Sanctions Database' });
  }

  // ── Secondary: Sanctions-tagged news ─────────────────────
  if (sanctionNews.length === 0) {
    findings.push('No sanctions-related news found in monitored news sources.');
  } else {
    score -= Math.min(sanctionNews.length * 20, 40);
    findings.push(`⚠️ ${sanctionNews.length} sanctions-related news article(s) found.`);
    for (const article of sanctionNews.slice(0, 3)) {
      findings.push(`  • "${article.title}" — ${article.source_name}`);
      sources.push({ url: article.source_url, title: article.title });
    }
  }

  score = clamp(score, 0, 100);

  const aiSummary = await generateModuleSummary('sanctions', companyName, score, scoreToRisk(score), findings, !ico);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Sanction Risks', score, companyName,
      sanctionsResult.matches.length === 0 && sanctionNews.length === 0 ? 'clean' : 'issues found'),
    findings,
    sources,
    raw_data: {
      opensanctions: {
        api_available:   sanctionsResult.api_available,
        matches:         sanctionsResult.matches,
        lists_checked:   sanctionsResult.lists_checked,
      },
      sanctionNews: sanctionNews.map((a) => ({ title: a.title, url: a.source_url, tags: a.tags })),
    },
  };
}

// ============================================================
// Module: Market & Reputation
// Data source: Czech news (Seznam, HN, E15, Forbes)
// ============================================================

async function evaluateMarket(ico: string, companyName: string, prefetchedArticles: ScrapedArticle[] = []): Promise<ModuleResult> {
  const articles = prefetchedArticles;

  let score = 70;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  // Bilingual keyword lists — Czech for CZ companies, English for international
  const positiveCz = ['zisk', 'akvizic', 'ocenění', 'růst'];
  const positiveEn = ['growth', 'expansion', 'award', 'investment', 'acquisition', 'profit', 'revenue record'];
  const negativeCz = ['insolvenc', 'úpadek', 'sankc', 'pokuta', 'kauza', 'propouštění', 'podvod'];
  const negativeEn = ['fraud', 'corruption', 'lawsuit', 'penalty', 'fine', 'scandal',
                      'misconduct', 'bribery', 'indictment', 'layoff', 'violation', 'recall'];

  const positiveKeywords = ico ? [...positiveCz, ...positiveEn] : positiveEn;
  const negativeKeywords = ico ? [...negativeCz, ...negativeEn] : negativeEn;

  if (articles.length === 0) {
    findings.push(`No recent news articles found for ${companyName} across monitored news sources.`);
  } else {
    findings.push(`${articles.length} news article(s) found mentioning ${companyName}.`);

    for (const article of articles.slice(0, 5)) {
      sources.push({ url: article.source_url, title: article.title });
    }

    let positiveCount = 0;
    let negativeCount = 0;

    for (const article of articles) {
      const content = article.content.toLowerCase();
      if (positiveKeywords.some((k) => content.includes(k))) positiveCount++;
      if (negativeKeywords.some((k) => content.includes(k))) negativeCount++;
    }

    if (positiveCount > 0) {
      score += Math.min(positiveCount * 3, 15);
      findings.push(`${positiveCount} article(s) with positive signals (growth, investment, recognition).`);
    }
    if (negativeCount > 0) {
      score -= negativeCount * 8;
      findings.push(`⚠️ ${negativeCount} article(s) with negative signals (sanctions, fines, misconduct, layoffs).`);
    }

    // Tag-based context
    const allTags = articles.flatMap((a) => a.tags);
    const tagCounts: Record<string, number> = {};
    for (const tag of allTags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => `${tag} (${count})`);

    if (topTags.length > 0) {
      findings.push(`Dominant news themes: ${topTags.join(', ')}`);
    }
  }

  score = clamp(score, 0, 100);

  const aiSummary = await generateModuleSummary('market', companyName, score, scoreToRisk(score), findings, !ico);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Market & Reputation', score, companyName, `${articles.length} articles found`),
    findings,
    sources,
    raw_data: {
      article_count: articles.length,
      articles: articles.slice(0, 10).map((a) => ({ title: a.title, url: a.source_url, tags: a.tags })),
    },
  };
}

// ============================================================
// Module: Environmental & ESG
// Data source: Energy licences (ERÚ) + ESG-tagged news
// ============================================================

async function evaluateESG(ico: string, companyName: string, prefetchedArticles: ScrapedArticle[] = []): Promise<ModuleResult> {
  const esgNews = prefetchedArticles.filter((a) => a.tags.includes('esg') || a.tags.includes('energy'));

  let score = 70;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  // Bilingual ESG keyword lists — Czech for CZ companies, English for international
  const positiveEsgCz = ['udržiteln', 'obnoviteln'];
  const positiveEsgEn = ['sustainability', 'renewable', 'solar', 'wind', 'circular economy',
                         'carbon neutral', 'net zero', 'decarbonization', 'green energy'];
  const negativeEsgCz = ['emis', 'uhlí'];
  const negativeEsgEn = ['pollution', 'coal', 'greenwashing', 'environmental violation',
                         'emissions scandal', 'labor dispute', 'human rights violation',
                         'child labor', 'deforestation'];

  const positiveEsg = ico ? [...positiveEsgCz, ...positiveEsgEn] : positiveEsgEn;
  const negativeEsg = ico ? [...negativeEsgCz, ...negativeEsgEn] : negativeEsgEn;

  // Czech ERÚ energy licence check — only applicable with IČO
  if (ico) {
    const licenses = await checkEnergyLicenses(ico);
    sources.push({ url: `https://www.eru.cz/licence?ico=${ico}`, title: 'ERÚ – Czech Energy Regulatory Office Licences' });

    if (licenses.length > 0) {
      const active = licenses.filter((l) => l.status === 'active');
      score += Math.min(active.length * 5, 15);
      findings.push(`${licenses.length} energy licence(s) found in Czech ERÚ (${active.length} active).`);
      for (const lic of licenses.slice(0, 3)) {
        findings.push(`  • ${lic.license_type} — ${lic.source.toUpperCase()} licence ${lic.license_number}`);
      }
    } else {
      findings.push('No energy licences found in Czech ERÚ — company is not in the Czech regulated energy sector.');
    }
  } else {
    findings.push('ESG assessment based on publicly available news and sustainability reports.');
  }

  // ESG news sentiment
  if (esgNews.length > 0) {
    let esgPositive = 0;
    let esgNegative = 0;

    for (const article of esgNews) {
      const content = article.content.toLowerCase();
      if (positiveEsg.some((k) => content.includes(k))) esgPositive++;
      if (negativeEsg.some((k) => content.includes(k))) esgNegative++;
    }

    if (esgPositive > 0) {
      score += Math.min(esgPositive * 4, 10);
      findings.push(`${esgPositive} article(s) with positive ESG signals (sustainability, renewables, carbon neutral).`);
    }
    if (esgNegative > 0) {
      score -= esgNegative * 8;
      findings.push(`⚠️ ${esgNegative} article(s) with negative ESG signals (pollution, greenwashing, labor violations).`);
    }
    for (const article of esgNews.slice(0, 3)) {
      sources.push({ url: article.source_url, title: article.title });
    }
  } else {
    findings.push('No ESG or sustainability-related news found in monitored sources.');
  }

  score = clamp(score, 0, 100);

  const aiSummary = await generateModuleSummary('esg', companyName, score, scoreToRisk(score), findings, !ico);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Environmental & ESG', score, companyName, `${esgNews.length} ESG articles`),
    findings,
    sources,
    raw_data: { esgNews: esgNews.map((a) => ({ title: a.title, url: a.source_url })) },
  };
}

// ============================================================
// Module: Cyber Security
// Data source: News with 'cyber' or 'gdpr' tags
// ============================================================

async function evaluateCyber(ico: string, companyName: string, prefetchedArticles: ScrapedArticle[] = []): Promise<ModuleResult> {
  const articles = prefetchedArticles;
  const cyberArticles = articles.filter((a) => a.tags.includes('cyber') || a.tags.includes('gdpr'));

  let score = 80;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  if (cyberArticles.length === 0) {
    findings.push('No cyber security or GDPR-related incidents found in monitored news sources.');
  } else {
    score -= cyberArticles.length * 15;
    findings.push(`⚠️ ${cyberArticles.length} cyber/GDPR-related article(s) found mentioning ${companyName}.`);

    for (const article of cyberArticles.slice(0, 5)) {
      findings.push(`  • "${article.title}" — ${article.source_name}`);
      sources.push({ url: article.source_url, title: article.title });
    }

    // Severity by keyword
    const highSeverity = ['ransomware', 'breach', 'únik dat', 'hack', 'data leak', 'výkupné'];
    const severe = cyberArticles.filter((a) =>
      highSeverity.some((k) => a.content.toLowerCase().includes(k))
    );
    if (severe.length > 0) {
      score -= severe.length * 10;
      findings.push(`🔴 ${severe.length} high-severity cyber incident article(s) detected (ransomware, data breach, etc.).`);
    }
  }

  score = clamp(score, 0, 100);

  const aiSummary = await generateModuleSummary('cyber', companyName, score, scoreToRisk(score), findings, !ico);

  return {
    score,
    risk_level: scoreToRisk(score),
    summary: aiSummary ?? buildSummary('Cyber Security', score, companyName, `${cyberArticles.length} incidents in public records`),
    findings,
    sources,
    raw_data: {
      cyberArticleCount: cyberArticles.length,
      articles: cyberArticles.map((a) => ({ title: a.title, url: a.source_url })),
      notes: ['Absence of public reports does not guarantee strong cyber posture — internal security assessments recommended before contracting.'],
    },
  };
}

// ============================================================
// Module: Internal Assessment
// No automation — placeholder for manual evaluation
// ============================================================

function evaluateInternal(): ModuleResult {
  return {
    score: 70,
    risk_level: 'medium',
    summary: 'Internal assessment requires manual review. Default score applied pending human evaluation.',
    findings: [
      'This module requires manual input from internal teams.',
      'Review internal procurement history, past incidents, and relationship quality.',
      'Update this assessment with findings from internal stakeholders.',
    ],
    sources: [],
    raw_data: { automated: false },
  };
}

// ============================================================
// Helpers
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreToRisk(score: number): string {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'critical';
}

function buildSummary(module: string, score: number, company: string, detail: string): string {
  const risk = scoreToRisk(score);
  return `${module} for ${company}: score ${score}/100 (${risk} risk). ${detail}.`;
}

import { getSupabase } from '../utils/clients';
import { log } from '../utils/helpers';
import { lookupCompanyByICO } from '../scrapers/ares';
import { checkInsolvency } from '../scrapers/insolvency';
import { checkEnergyLicenses } from '../scrapers/energy';
import { scrapeNewsForSupplier } from '../scrapers/firecrawl-scraper';
import type { AresCompanyData, InsolvencyRecord, EnergyLicenseData, ScrapedArticle } from '../types';

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
        result = await evaluateFinancial(ico, companyName);
        break;
      case 'compliance':
        result = await evaluateCompliance(ico, companyName);
        break;
      case 'sanctions':
        result = await evaluateSanctions(ico, companyName, prefetchedArticles);
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
// Data source: ARES (company fundamentals)
// ============================================================

async function evaluateFinancial(ico: string, companyName: string): Promise<ModuleResult> {
  // Non-Czech companies have no IČO — skip ARES, return neutral assessment
  if (!ico) {
    return {
      score: 60,
      risk_level: 'medium',
      summary: `Financial Health for ${companyName}: score 60/100 (medium risk). No Czech IČO — ARES registry not applicable for international companies.`,
      findings: [
        `${companyName} is not registered in the Czech Republic — Czech ARES registry does not apply.`,
        'For international companies, financial health assessment should be supplemented with data from OpenCorporates, Dun & Bradstreet, or local business registries.',
        'Manual review of publicly available financial statements is recommended.',
      ],
      sources: [
        { url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – International Business Registry' },
      ],
      raw_data: { international: true },
    };
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

  let score = 70;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [
    { url: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, title: 'ARES – Czech Business Register' },
  ];

  // Status assessment
  if (ares.status === 'active') {
    score += 10;
    findings.push(`Company is actively registered: ${ares.company_name}`);
  } else if (ares.status === 'in_liquidation') {
    score -= 30;
    findings.push(`⚠️ Company is in liquidation — significant financial risk.`);
  } else if (ares.status === 'inactive') {
    score -= 20;
    findings.push(`⚠️ Company is inactive in the ARES registry.`);
  }

  // Registration age
  if (ares.registration_date) {
    const years = (Date.now() - new Date(ares.registration_date).getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (years >= 5) {
      score += 5;
      findings.push(`Established company — registered since ${ares.registration_date.slice(0, 10)} (${Math.floor(years)} years).`);
    } else {
      findings.push(`Newer company — registered ${Math.floor(years)} year(s) ago.`);
    }
  }

  // Legal form
  if (ares.legal_form) {
    findings.push(`Legal form: ${ares.legal_form}`);
  }

  // Address
  if (ares.address) {
    findings.push(`Registered address: ${ares.address}`);
  }

  // Business activities
  if (ares.business_activities.length > 0) {
    findings.push(`Business activities: ${ares.business_activities.slice(0, 3).join('; ')}`);
    score += 5;
  }

  // Financial statements availability
  if (ares.financial_statements_url) {
    sources.push({ url: ares.financial_statements_url, title: 'Sbírka listin – Financial Statements' });
    score += 5;
    findings.push('Financial statements available in the Collection of Documents (Sbírka listin).');
  } else {
    findings.push('No financial statements URL available in ARES.');
  }

  score = clamp(score, 0, 100);
  return {
    score,
    risk_level: scoreToRisk(score),
    summary: buildSummary('Financial Health', score, ares.company_name, ares.status),
    findings,
    sources,
    raw_data: { ares },
  };
}

// ============================================================
// Module: Compliance & Legal
// Data sources: ARES (status) + Insolvency Register (ISIR)
// ============================================================

async function evaluateCompliance(ico: string, companyName: string): Promise<ModuleResult> {
  // Non-Czech companies — skip ARES and ISIR entirely
  if (!ico) {
    return {
      score: 65,
      risk_level: 'medium',
      summary: `Compliance & Legal for ${companyName}: score 65/100 (medium risk). Czech registries (ARES, ISIR) not applicable — international company.`,
      findings: [
        `${companyName} has no Czech IČO — ARES (Czech Business Register) and ISIR (Czech Insolvency Register) do not apply.`,
        'For international compliance verification, consult the relevant national business registry of the country of incorporation.',
        'Recommended checks: local insolvency registers, sanctions lists (EU, OFAC, UN), court records in the country of origin.',
      ],
      sources: [
        { url: `https://opencorporates.com/companies?q=${encodeURIComponent(companyName)}`, title: 'OpenCorporates – International Business Registry' },
        { url: 'https://www.sanctionsmap.eu/', title: 'EU Sanctions Map' },
      ],
      raw_data: { international: true },
    };
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
      findings.push(`⚠️ Company is in liquidation — compliance risk.`);
    } else if (ares.status === 'inactive') {
      score -= 20;
      findings.push(`⚠️ Company is inactive per ARES.`);
    } else {
      findings.push(`Company is active and properly registered in the Czech Business Register.`);
    }
  } else {
    score -= 15;
    findings.push(`Company not found in ARES — registration status unknown.`);
  }

  // Insolvency records
  if (insolvency.length === 0) {
    findings.push('No insolvency records found in the Czech Insolvency Register (ISIR).');
    score += 5;
  } else {
    const active = insolvency.filter((r) => r.status === 'active');
    const resolved = insolvency.filter((r) => r.status !== 'active');

    if (active.length > 0) {
      score -= active.length * 40;
      findings.push(`🔴 ${active.length} active insolvency proceeding(s): ${active.map((r) => r.case_number).join(', ')}`);
    }
    if (resolved.length > 0) {
      score -= resolved.length * 10;
      findings.push(`Historical insolvency proceedings (resolved): ${resolved.map((r) => r.case_number).join(', ')}`);
    }
  }

  score = clamp(score, 0, 100);
  return {
    score,
    risk_level: scoreToRisk(score),
    summary: buildSummary('Compliance & Legal', score, companyName, insolvency.length === 0 ? 'clean' : 'issues found'),
    findings,
    sources,
    raw_data: { ares, insolvency },
  };
}

// ============================================================
// Module: Sanction Risks
// Data sources: Insolvency + sanctions-tagged news
// ============================================================

async function evaluateSanctions(ico: string, companyName: string, prefetchedArticles: ScrapedArticle[] = []): Promise<ModuleResult> {
  const sanctionNews = prefetchedArticles.filter((a) => a.tags.includes('sanctions'));

  let score = 90;
  const findings: string[] = [];
  const sources: { url: string; title: string }[] = [];

  // For Czech companies only: check ISIR as a sanctions risk proxy
  if (ico) {
    const insolvency = await checkInsolvency(ico);
    sources.push({ url: `https://isir.justice.cz/isir/ueu/vysledek_lustrace.do?ic=${ico}&typ=ic`, title: 'ISIR – Czech Insolvency Register' });

    const activeInsolvency = insolvency.filter((r) => r.status === 'active');
    if (activeInsolvency.length > 0) {
      score -= activeInsolvency.length * 30;
      findings.push(`⚠️ ${activeInsolvency.length} active insolvency case(s) detected — potential financial sanctions risk.`);
    } else {
      findings.push('No active insolvency proceedings detected in Czech ISIR.');
    }
  } else {
    findings.push('Czech Insolvency Register (ISIR) not applicable — international company. Sanctions screening based on news sources only.');
    findings.push('Recommended: verify against EU sanctions list, OFAC SDN list, and UN consolidated sanctions list.');
    sources.push({ url: 'https://www.sanctionsmap.eu/', title: 'EU Sanctions Map' });
    sources.push({ url: 'https://sanctionssearch.ofac.treas.gov/', title: 'OFAC Sanctions Search' });
  }

  // Sanctions-related news (applies to all companies)
  if (sanctionNews.length === 0) {
    findings.push('No sanctions-related news found in monitored news sources.');
  } else {
    score -= sanctionNews.length * 20;
    findings.push(`🔴 ${sanctionNews.length} sanctions-related news article(s) found.`);
    for (const article of sanctionNews.slice(0, 3)) {
      findings.push(`  • "${article.title}" — ${article.source_name}`);
      sources.push({ url: article.source_url, title: article.title });
    }
  }

  score = clamp(score, 0, 100);
  return {
    score,
    risk_level: scoreToRisk(score),
    summary: buildSummary('Sanction Risks', score, companyName, sanctionNews.length === 0 ? 'clean' : 'issues found'),
    findings,
    sources,
    raw_data: { sanctionNews: sanctionNews.map((a) => ({ title: a.title, url: a.source_url, tags: a.tags })) },
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

  if (articles.length === 0) {
    findings.push('No recent news articles found for this company across Czech news sources.');
    findings.push('Limited media presence may indicate a smaller market footprint.');
  } else {
    findings.push(`Found ${articles.length} news article(s) mentioning ${companyName}.`);

    for (const article of articles.slice(0, 5)) {
      sources.push({ url: article.source_url, title: article.title });
    }

    // Simple sentiment heuristic based on tag presence
    const positiveKeywords = ['zisk', 'growth', 'expansion', 'award', 'investment', 'akvizic', 'finance'];
    const negativeKeywords = ['insolvenc', 'úpadek', 'sankc', 'scandal', 'pokuta', 'kauza', 'layoff', 'propouštění'];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const article of articles) {
      const content = article.content.toLowerCase();
      if (positiveKeywords.some((k) => content.includes(k))) positiveCount++;
      if (negativeKeywords.some((k) => content.includes(k))) negativeCount++;
    }

    if (positiveCount > 0) {
      score += Math.min(positiveCount * 3, 15);
      findings.push(`${positiveCount} article(s) with positive indicators (growth, investment, financial results).`);
    }
    if (negativeCount > 0) {
      score -= negativeCount * 8;
      findings.push(`⚠️ ${negativeCount} article(s) with negative indicators (insolvency, sanctions, layoffs).`);
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
      findings.push(`Most frequent content themes: ${topTags.join(', ')}`);
    }
  }

  score = clamp(score, 0, 100);
  return {
    score,
    risk_level: scoreToRisk(score),
    summary: buildSummary('Market & Reputation', score, companyName, `${articles.length} articles found`),
    findings,
    sources,
    raw_data: { article_count: articles.length, articles: articles.slice(0, 10).map((a) => ({ title: a.title, url: a.source_url, tags: a.tags })) },
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
      findings.push('No energy licences found in Czech ERÚ — company is likely not in the Czech regulated energy sector.');
    }
  } else {
    findings.push('Czech ERÚ energy licence registry not applicable — international company.');
    findings.push('ESG assessment based on publicly available news sources. Manual review of sustainability reports recommended.');
  }

  // ESG news
  if (esgNews.length > 0) {
    const positiveEsg = ['udržiteln', 'renewable', 'solar', 'wind', 'circular', 'carbon neutral'];
    const negativeEsg = ['emis', 'pollution', 'uhlí', 'coal', 'greenwashing'];

    let esgPositive = 0;
    let esgNegative = 0;

    for (const article of esgNews) {
      const content = article.content.toLowerCase();
      if (positiveEsg.some((k) => content.includes(k))) esgPositive++;
      if (negativeEsg.some((k) => content.includes(k))) esgNegative++;
    }

    if (esgPositive > 0) {
      score += Math.min(esgPositive * 4, 10);
      findings.push(`${esgPositive} positive ESG/sustainability article(s) found.`);
    }
    if (esgNegative > 0) {
      score -= esgNegative * 8;
      findings.push(`⚠️ ${esgNegative} article(s) with negative ESG indicators (emissions, coal, pollution).`);
    }
    for (const article of esgNews.slice(0, 3)) {
      sources.push({ url: article.source_url, title: article.title });
    }
  } else {
    findings.push('No ESG or energy-related news found for this company.');
  }

  score = clamp(score, 0, 100);
  return {
    score,
    risk_level: scoreToRisk(score),
    summary: buildSummary('Environmental & ESG', score, companyName, `${esgNews.length} ESG articles`),
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
    findings.push('No cyber security or GDPR-related incidents found in Czech news sources.');
    findings.push('Note: Absence of public reports does not guarantee strong cyber posture — internal assessments recommended.');
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
  return {
    score,
    risk_level: scoreToRisk(score),
    summary: buildSummary('Cyber Security', score, companyName, `${cyberArticles.length} incidents in public records`),
    findings,
    sources,
    raw_data: { cyberArticleCount: cyberArticles.length, articles: cyberArticles.map((a) => ({ title: a.title, url: a.source_url })) },
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

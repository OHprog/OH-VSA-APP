import { ScrapedArticle } from '../types';
import { getAIML } from './clients';
import { log } from './helpers';
import { trackApiUsage } from './supabase-storage';

// Maximum sources and articles per source to summarize (keeps token usage bounded)
const MAX_SOURCES = 6;
const MAX_ARTICLES_PER_SOURCE = 8;
const SNIPPET_CHARS = 300;

// ============================================================
// Source-level summaries
// ============================================================

const SOURCE_SUMMARY_SYSTEM_PROMPT =
  'You are a business intelligence analyst reviewing news coverage of a vendor company. ' +
  'You will receive a list of articles from a single news source. ' +
  'Write 2–3 concise sentences summarising what this source reports about the vendor. ' +
  'Be factual, professional, and write in English.';

/**
 * Generate a short AI summary (2–3 sentences) for each news source
 * that contributed articles in this scrape run.
 *
 * Returns a map of { source_name: summaryText }.
 * Sources that fail to summarize are skipped and logged as warnings.
 */
export async function generateSourceSummaries(
  articles: ScrapedArticle[]
): Promise<Record<string, string>> {
  // Group articles by source
  const bySource = new Map<string, ScrapedArticle[]>();
  for (const article of articles) {
    const list = bySource.get(article.source_name) ?? [];
    list.push(article);
    bySource.set(article.source_name, list);
  }

  // Pick the top MAX_SOURCES sources (most articles first)
  const sortedSources = [...bySource.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, MAX_SOURCES);

  const summaries: Record<string, string> = {};
  const aiml = getAIML();

  for (const [sourceName, sourceArticles] of sortedSources) {
    try {
      const subset = sourceArticles.slice(0, MAX_ARTICLES_PER_SOURCE);

      const articleLines = subset
        .map((a, i) => {
          const snippet = a.content.slice(0, SNIPPET_CHARS).replace(/\s+/g, ' ').trim();
          return `${i + 1}. ${a.title || '(no title)'}\n   ${snippet}`;
        })
        .join('\n\n');

      const userMessage =
        `Source: ${sourceName}\n` +
        `Article count: ${subset.length}\n\n` +
        `Articles:\n${articleLines}`;

      const response = await aiml.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SOURCE_SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      trackApiUsage('aiml', response.usage?.total_tokens ?? 0).catch(() => {});

      const summary = response.choices[0]?.message?.content?.trim();
      if (summary) {
        summaries[sourceName] = summary;
        log('info', 'AISummarizer', `Summarized ${sourceName} (${subset.length} articles)`);
      }
    } catch (err: any) {
      log('warn', 'AISummarizer', `Failed to summarize source "${sourceName}": ${err.message}`);
    }
  }

  return summaries;
}

// ============================================================
// Per-module summaries
// Each prompt is oriented toward the contracting safety decision.
// ============================================================

const MODULE_SYSTEM_PROMPTS: Record<string, string> = {
  financial:
    'You are a financial risk analyst advising a procurement team on vendor contracting. ' +
    'Given financial health data and key metrics for a vendor, write 2–3 sentences assessing ' +
    'whether their financial position supports entering a contract: their stability, ' +
    'ability to deliver on obligations, and the most significant financial risks. ' +
    'Be direct and professional.',

  compliance:
    'You are a legal compliance analyst advising a procurement team on vendor contracting. ' +
    'Given company registration status and legal standing data, write 2–3 sentences stating ' +
    'whether there are legal impediments to contracting with this vendor, any active proceedings ' +
    'that could disrupt service delivery, and what due diligence steps are recommended. ' +
    'Be direct and professional.',

  sanctions:
    'You are a sanctions compliance officer at an EU company advising on vendor contracting. ' +
    'Given sanctions screening results, write 2–3 sentences stating clearly whether any sanctions ' +
    'matches were found, which lists were checked, and whether it is legally safe to proceed with ' +
    'contracting from a sanctions law perspective. ' +
    'If clean, say so explicitly. If a match was found, flag the severity clearly.',

  market:
    'You are a market intelligence analyst advising a procurement team on vendor contracting. ' +
    'Given news coverage and media sentiment signals for a vendor, write 2–3 sentences assessing ' +
    'whether public controversies, legal disputes, or reputational issues should factor into ' +
    'the contracting decision. Be direct and professional.',

  esg:
    'You are an ESG risk analyst advising a procurement team on vendor contracting. ' +
    'Given environmental and social governance data for a vendor, write 2–3 sentences assessing ' +
    'whether their ESG practices present risks relevant to CETIN\'s sustainability commitments ' +
    'and the contracting decision. Be direct and professional.',

  cyber:
    'You are a cybersecurity risk analyst advising a procurement team on vendor contracting. ' +
    'Given publicly known security incidents and cyber risk signals for a vendor, write 2–3 sentences ' +
    'assessing the vendor\'s cyber risk profile and what security due diligence is recommended ' +
    'before contracting. Be direct and professional.',
};

/**
 * Generate a 2–3 sentence AI summary for a single evaluation module,
 * framed as procurement contracting advice.
 *
 * Falls back to null (caller should use buildSummary template) if the AI call fails.
 */
export async function generateModuleSummary(
  moduleType: string,
  companyName: string,
  score: number,
  riskLevel: string,
  findings: string[],
  isInternational: boolean
): Promise<string | null> {
  const systemPrompt = MODULE_SYSTEM_PROMPTS[moduleType];
  if (!systemPrompt) {
    log('warn', 'AISummarizer', `No system prompt defined for module type "${moduleType}"`);
    return null;
  }

  const companyContext = isInternational
    ? `${companyName} (international company — no Czech registration)`
    : `${companyName} (Czech company)`;

  const findingsText = findings
    .filter((f) => f.trim())
    .slice(0, 8)
    .map((f, i) => `${i + 1}. ${f.replace(/^[🔴⚠️✅•\s]+/, '').trim()}`)
    .join('\n');

  const userMessage =
    `Vendor: ${companyContext}\n` +
    `Module: ${moduleType}\n` +
    `Score: ${score}/100 (${riskLevel} risk)\n\n` +
    `Key findings:\n${findingsText || '(no findings available)'}`;

  try {
    const aiml = getAIML();
    const response = await aiml.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    trackApiUsage('aiml', response.usage?.total_tokens ?? 0).catch(() => {});

    const summary = response.choices[0]?.message?.content?.trim();
    if (summary) {
      log('info', 'AISummarizer', `Generated ${moduleType} module summary for "${companyName}"`);
      return summary;
    }
    return null;
  } catch (err: any) {
    log('warn', 'AISummarizer', `Module summary failed for "${moduleType}": ${err.message}`);
    return null;
  }
}

// ============================================================
// Executive summary — cross-module synthesis
// ============================================================

const EXECUTIVE_SUMMARY_SYSTEM_PROMPT =
  'You are a senior procurement risk officer preparing a vendor clearance briefing for a procurement team. ' +
  'Given multi-module risk scores and summaries for a vendor evaluation, write exactly 3–4 sentences that: ' +
  '(1) state the overall vendor risk profile concisely, ' +
  '(2) name the 1–2 most significant risk factors found, ' +
  '(3) end with a clear recommendation in one of these forms: ' +
  '"PROCEED", "PROCEED WITH CONDITIONS: [condition]", "ESCALATE FOR REVIEW: [reason]", or "DO NOT PROCEED: [reason]". ' +
  'Be direct and professional. Do not use markdown formatting.';

export interface ModuleResultSummary {
  module_type: string;
  score: number | null;
  risk_level: string | null;
  summary: string | null;
}

/**
 * Generate a 3–4 sentence executive summary synthesising all module results.
 * Returns null if generation fails — caller should leave executive_summary as null.
 */
export async function generateExecutiveSummary(
  companyName: string,
  overallScore: number,
  overallRisk: string,
  moduleResults: ModuleResultSummary[]
): Promise<string | null> {
  const moduleLines = moduleResults
    .filter((m) => m.score !== null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100)) // lowest scores first (most concerning)
    .map((m) => {
      const pct = m.score !== null ? `${m.score}/100` : 'N/A';
      const risk = m.risk_level ?? 'unknown';
      const summary = m.summary ? ` — ${m.summary.slice(0, 150)}` : '';
      return `- ${m.module_type.toUpperCase()} [${pct}, ${risk} risk]${summary}`;
    })
    .join('\n');

  const userMessage =
    `Vendor: ${companyName}\n` +
    `Overall score: ${overallScore}/100 (${overallRisk} risk)\n\n` +
    `Module results (worst first):\n${moduleLines}`;

  try {
    const aiml = getAIML();
    const response = await aiml.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXECUTIVE_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    trackApiUsage('aiml', response.usage?.total_tokens ?? 0).catch(() => {});

    const summary = response.choices[0]?.message?.content?.trim();
    if (summary) {
      log('info', 'AISummarizer', `Generated executive summary for "${companyName}"`);
      return summary;
    }
    return null;
  } catch (err: any) {
    log('warn', 'AISummarizer', `Executive summary generation failed: ${err.message}`);
    return null;
  }
}

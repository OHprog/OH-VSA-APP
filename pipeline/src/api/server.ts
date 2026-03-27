import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runModule } from '../evaluators/moduleEvaluator';
import { getSupabase, getAIML } from '../utils/clients';
import { log } from '../utils/helpers';
import { scrapeNewsForSupplier } from '../scrapers/firecrawl-scraper';
import { INTERNATIONAL_NEWS_SOURCES } from '../config/sources';
import {
  startScrapeRun,
  completeScrapeRun,
  saveArticlesForEvaluation,
  updateScrapeRunSummaries,
  trackFirecrawlUsage,
} from '../utils/supabase-storage';
import { generateSourceSummaries, generateExecutiveSummary } from '../utils/ai-summarizer';
import type { ModuleResultSummary } from '../utils/ai-summarizer';
import type { ScrapedArticle } from '../types';

dotenv.config();

const app = express();

// Allow origins from CORS_ORIGIN env var (comma-separated) or all in dev
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : undefined;

app.use(
  cors({
    origin: allowedOrigins ?? true,
    credentials: true,
  })
);
app.use(express.json());

// ============================================================
// Health check
// ============================================================

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    services: {
      firecrawl: !!process.env.FIRECRAWL_API_KEY,
      aiml: !!process.env.AIML_API_KEY,
    },
  });
});

// ============================================================
// POST /evaluate
// Triggered by the Supabase Edge Function when a new evaluation is created.
// Body: { evaluation_id, ico, company_name, modules: string[] }
// ============================================================

app.post('/evaluate', async (req, res) => {
  const { evaluation_id, ico, company_name, country, website_url, modules } = req.body as {
    evaluation_id: string;
    ico: string;
    company_name: string;
    country?: string;
    website_url?: string;
    modules: string[];
  };

  if (!evaluation_id || !company_name || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({
      error: 'evaluation_id, company_name, and a non-empty modules array are required',
    });
  }

  log('info', 'API', `Starting evaluation ${evaluation_id} for ${company_name} (${ico || 'international'}), modules: ${modules.join(', ')}`);

  // Respond immediately — the pipeline runs in the background
  res.json({ ok: true, evaluation_id, message: 'Evaluation started' });

  // Run the full pipeline asynchronously
  runEvaluationPipeline(evaluation_id, ico, company_name, country ?? '', website_url ?? '', modules).catch((err) => {
    log('error', 'API', `Unhandled pipeline error for ${evaluation_id}: ${err.message}`);
  });
});

// ============================================================
// POST /chat
// AI analyst chat about the supplier evaluation portfolio.
// Body: { message: string, context: ChatContext, history: ChatMessage[] }
// Uses gpt-4o-mini (cost-efficient) with dashboard context injected into system prompt.
// History is capped to the last 10 messages to bound token usage.
// ============================================================

interface ChatContext {
  stats: {
    total_suppliers: number;
    active_evaluations: number;
    completed_evaluations: number;
    avg_score: number;
    low_risk_count: number;
    medium_risk_count: number;
    high_risk_count: number;
    critical_risk_count: number;
  } | null;
  recentEvaluations: Array<{
    company_name: string;
    ico: string | null;
    status: string;
    overall_score: number | null;
    overall_risk_level: string | null;
    modules_completed: number;
    module_count: number;
  }>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildChatSystemPrompt(ctx: ChatContext): string {
  const s = ctx.stats;
  const portfolio = s
    ? `PORTFOLIO OVERVIEW:\n` +
      `- Total suppliers tracked: ${s.total_suppliers}\n` +
      `- Active evaluations: ${s.active_evaluations}\n` +
      `- Completed evaluations: ${s.completed_evaluations}\n` +
      `- Portfolio average score: ${s.avg_score != null ? Math.round(s.avg_score) : 'N/A'}/100\n` +
      `- Risk breakdown — Low: ${s.low_risk_count}, Medium: ${s.medium_risk_count}, High: ${s.high_risk_count}, Critical: ${s.critical_risk_count}`
    : 'No portfolio data available yet.';

  const recentLines =
    ctx.recentEvaluations.length > 0
      ? ctx.recentEvaluations
          .map((e) => {
            const score = e.overall_score != null ? `${e.overall_score}/100` : 'pending';
            const risk = e.overall_risk_level ?? 'pending';
            return `- ${e.company_name}${e.ico ? ` (IČO: ${e.ico})` : ''}: score ${score}, risk ${risk}, status ${e.status}, modules ${e.modules_completed}/${e.module_count}`;
          })
          .join('\n')
      : 'No recent evaluations available.';

  return (
    `You are an AI procurement risk analyst for CETIN a.s., a Czech telecommunications infrastructure company. ` +
    `CETIN owns and operates the fixed-line telephone and fibre infrastructure in Czechia and contracts with many vendors for services, materials, and technology.\n\n` +
    `You have access to live supplier evaluation data from the dashboard:\n\n` +
    `${portfolio}\n\n` +
    `RECENT EVALUATIONS (most recent first):\n${recentLines}\n\n` +
    `Your responsibilities:\n` +
    `1. Answer questions about specific suppliers or the overall vendor portfolio\n` +
    `2. Explain what risk scores mean in the context of CETIN's procurement decisions\n` +
    `3. Describe what each evaluation module measures: financial health, compliance/legal, sanctions screening, market reputation, ESG practices, cybersecurity posture\n` +
    `4. Identify patterns, trends, or concerns across the portfolio\n` +
    `5. Give concise, actionable procurement recommendations\n\n` +
    `Rules: Keep responses to 3–5 sentences. Be professional, specific, and direct. ` +
    `If a vendor is not in the data, say so clearly. ` +
    `Flag any speculation as general guidance. Do not use markdown or bullet points.`
  );
}

app.post('/chat', async (req, res) => {
  const { message, context, history } = req.body as {
    message: string;
    context: ChatContext;
    history: ChatMessage[];
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const aiml = getAIML();
    const systemPrompt = buildChatSystemPrompt(context ?? { stats: null, recentEvaluations: [] });
    const trimmedHistory = (history ?? []).slice(-10);

    const response = await aiml.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: message.trim() },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from AI');

    log('info', 'Chat', `Reply generated (${reply.length} chars)`);
    res.json({ reply });
  } catch (err: any) {
    log('error', 'Chat', `Chat error: ${err.message}`);
    // Include detail so we can diagnose the exact AIML error from Azure logs
    res.status(500).json({ error: 'Failed to generate response', detail: err.message });
  }
});

// ============================================================
// Pipeline orchestration
// ============================================================

async function runEvaluationPipeline(
  evaluationId: string,
  ico: string,
  companyName: string,
  country: string,
  websiteUrl: string,
  modules: string[]
): Promise<void> {
  const supabase = getSupabase();

  try {
    // Mark evaluation as running
    await supabase
      .from('evaluations')
      .update({ status: 'running' })
      .eq('id', evaluationId);

    log('info', 'Pipeline', `Set evaluation ${evaluationId} → running`);

    // Pre-scrape news ONCE — shared across sanctions, market, ESG, cyber modules
    const scrapeStart = Date.now();
    const runId = await startScrapeRun(evaluationId, ico, companyName);
    let prefetchedArticles: ScrapedArticle[] = [];

    try {
      // Use international news sources when no Czech IČO is present
      const newsSources = ico ? undefined : INTERNATIONAL_NEWS_SOURCES;
      prefetchedArticles = await withTimeout(
        scrapeNewsForSupplier(companyName, ico, newsSources),
        90_000,
        []
      );
      if (prefetchedArticles.length === 0) {
        log('warn', 'Pipeline', `Pre-scrape timed out or returned nothing for ${companyName} — proceeding with empty articles`);
      }
      await completeScrapeRun(runId!, prefetchedArticles, Date.now() - scrapeStart, []);
      await saveArticlesForEvaluation(runId, evaluationId, ico, prefetchedArticles);
      await trackFirecrawlUsage(1); // Track each scrape attempt (not article count)
      log('info', 'Pipeline', `Pre-scraped ${prefetchedArticles.length} articles for ${companyName}`);

      // Generate per-source AI summaries and store on the scrape run record
      if (runId && prefetchedArticles.length > 0) {
        const summaries = await withTimeout(generateSourceSummaries(prefetchedArticles), 60_000, {});
        await updateScrapeRunSummaries(runId, summaries);
      }
    } catch (err: any) {
      log('warn', 'Pipeline', `Pre-scrape failed for ${companyName}: ${err.message}`);
      await completeScrapeRun(runId!, [], Date.now() - scrapeStart, [err.message]);
    }

    // Run all requested modules in parallel, passing pre-fetched articles
    const results = await Promise.allSettled(
      modules.map((moduleType) =>
        runModule(evaluationId, moduleType, ico, companyName, country, websiteUrl, prefetchedArticles)
      )
    );

    // Collect scores from completed modules
    const { data: completedModules } = await supabase
      .from('evaluation_modules')
      .select('score, status')
      .eq('evaluation_id', evaluationId)
      .eq('status', 'completed');

    const scores = (completedModules ?? [])
      .map((m) => m.score)
      .filter((s): s is number => typeof s === 'number');

    const overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    const overallRisk = scoreToRiskLevel(overallScore);

    // Check if any module failed
    const anyFailed = results.some((r) => r.status === 'rejected');

    await supabase
      .from('evaluations')
      .update({
        status: anyFailed && scores.length === 0 ? 'failed' : 'completed',
        overall_score: overallScore,
        overall_risk_level: overallRisk,
        completed_at: new Date().toISOString(),
      })
      .eq('id', evaluationId);

    log('info', 'Pipeline', `Evaluation ${evaluationId} completed. Score: ${overallScore}, Risk: ${overallRisk}`);

    // Generate AI executive summary and save
    if (overallScore !== null && (completedModules?.length ?? 0) > 0) {
      try {
        const { data: moduleRows } = await supabase
          .from('evaluation_modules')
          .select('module_type, score, risk_level, summary')
          .eq('evaluation_id', evaluationId)
          .eq('status', 'completed');

        if (moduleRows && moduleRows.length > 0) {
          const execSummary = await withTimeout(
            generateExecutiveSummary(
              companyName,
              overallScore,
              overallRisk,
              moduleRows as ModuleResultSummary[]
            ),
            30_000,
            null
          );

          if (execSummary) {
            await supabase
              .from('evaluations')
              .update({ executive_summary: execSummary })
              .eq('id', evaluationId);
            log('info', 'Pipeline', `Executive summary saved for ${evaluationId}`);
          }
        }
      } catch (err: any) {
        log('warn', 'Pipeline', `Executive summary generation failed: ${err.message}`);
      }
    }
  } catch (err: any) {
    log('error', 'Pipeline', `Fatal error for evaluation ${evaluationId}: ${err.message}`);
    await supabase
      .from('evaluations')
      .update({ status: 'failed' })
      .eq('id', evaluationId);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function scoreToRiskLevel(score: number | null): string {
  if (score === null) return 'medium';
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'critical';
}

// ============================================================
// Startup recovery — mark stale in-flight evaluations as failed
// Any evaluation/scrape-run left "running" from a previous process
// (deployment restart, crash) would be stuck forever without this.
// ============================================================

async function recoverStaleEvaluations(): Promise<void> {
  const supabase = getSupabase();
  // Anything still "running" after 30 minutes is definitely orphaned
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from('evaluations')
    .select('id')
    .eq('status', 'running')
    .lt('created_at', cutoff);

  if (error) {
    log('warn', 'Server', `Startup recovery query failed: ${error.message}`);
    return;
  }

  if (!stale || stale.length === 0) return;

  const ids = stale.map((r) => r.id);
  log('warn', 'Server', `Startup recovery: marking ${ids.length} stale evaluation(s) as failed: ${ids.join(', ')}`);

  await supabase
    .from('evaluations')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .in('id', ids);

  await supabase
    .from('firecrawl_scrape_runs')
    .update({ status: 'failed', completed_at: new Date().toISOString(), errors: ['Pipeline restarted mid-execution'] })
    .in('evaluation_id', ids)
    .eq('status', 'running');
}

// ============================================================
// GET /firecrawl-credits
// Returns Firecrawl account credit balance + our 30-day scrape stats from Supabase.
// ============================================================

app.get('/firecrawl-credits', async (_req, res) => {
  try {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    if (!fcKey) return res.status(503).json({ error: 'FIRECRAWL_API_KEY not configured' });

    // Fetch account balance from Firecrawl
    const fcRes = await fetch('https://api.firecrawl.dev/v1/team/credit-usage?days=30', {
      headers: { Authorization: `Bearer ${fcKey}` },
    });
    const fcData = (await fcRes.json()) as {
      success: boolean;
      data?: { remaining_credits: number; plan_credits: number; billing_period_start: string | null; billing_period_end: string | null };
    };

    // Fetch our own 30-day scrape run stats from Supabase
    const supabase = getSupabase();
    const { data: runs } = await supabase
      .from('firecrawl_scrape_runs')
      .select('created_at, sources_scraped, articles_found, articles_stored, status, duration_ms')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString());

    const stats = (runs ?? []).reduce(
      (acc, r) => {
        acc.total_runs++;
        acc.total_sources += r.sources_scraped ?? 0;
        acc.total_articles_found += r.articles_found ?? 0;
        acc.total_articles_stored += r.articles_stored ?? 0;
        if (r.status === 'completed') acc.completed++;
        if (r.status === 'failed') acc.failed++;
        return acc;
      },
      { total_runs: 0, total_sources: 0, total_articles_found: 0, total_articles_stored: 0, completed: 0, failed: 0 }
    );

    res.json({
      account: fcData.success ? fcData.data : null,
      last_30_days: stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Start server
// ============================================================

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  log('info', 'Server', `Pipeline API listening on port ${PORT}`);
  recoverStaleEvaluations().catch((err) =>
    log('error', 'Server', `Startup recovery failed: ${err.message}`)
  );
});

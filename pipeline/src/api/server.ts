import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runModule } from '../evaluators/moduleEvaluator';
import { getSupabase } from '../utils/clients';
import { log } from '../utils/helpers';
import { scrapeNewsForSupplier } from '../scrapers/firecrawl-scraper';
import {
  startScrapeRun,
  completeScrapeRun,
  saveArticlesForEvaluation,
  updateScrapeRunSummaries,
  trackFirecrawlUsage,
} from '../utils/supabase-storage';
import { generateSourceSummaries } from '../utils/ai-summarizer';
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
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ============================================================
// POST /evaluate
// Triggered by the Supabase Edge Function when a new evaluation is created.
// Body: { evaluation_id, ico, company_name, modules: string[] }
// ============================================================

app.post('/evaluate', async (req, res) => {
  const { evaluation_id, ico, company_name, modules } = req.body as {
    evaluation_id: string;
    ico: string;
    company_name: string;
    modules: string[];
  };

  if (!evaluation_id || !ico || !Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({
      error: 'evaluation_id, ico, and a non-empty modules array are required',
    });
  }

  log('info', 'API', `Starting evaluation ${evaluation_id} for ${company_name} (${ico}), modules: ${modules.join(', ')}`);

  // Respond immediately — the pipeline runs in the background
  res.json({ ok: true, evaluation_id, message: 'Evaluation started' });

  // Run the full pipeline asynchronously
  runEvaluationPipeline(evaluation_id, ico, company_name, modules).catch((err) => {
    log('error', 'API', `Unhandled pipeline error for ${evaluation_id}: ${err.message}`);
  });
});

// ============================================================
// Pipeline orchestration
// ============================================================

async function runEvaluationPipeline(
  evaluationId: string,
  ico: string,
  companyName: string,
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
      prefetchedArticles = await scrapeNewsForSupplier(companyName, ico);
      await completeScrapeRun(runId!, prefetchedArticles, Date.now() - scrapeStart, []);
      await saveArticlesForEvaluation(runId, evaluationId, ico, prefetchedArticles);
      await trackFirecrawlUsage(prefetchedArticles.length);
      log('info', 'Pipeline', `Pre-scraped ${prefetchedArticles.length} articles for ${companyName}`);

      // Generate per-source AI summaries and store on the scrape run record
      if (runId && prefetchedArticles.length > 0) {
        const summaries = await generateSourceSummaries(prefetchedArticles);
        await updateScrapeRunSummaries(runId, summaries);
      }
    } catch (err: any) {
      log('warn', 'Pipeline', `Pre-scrape failed for ${companyName}: ${err.message}`);
      await completeScrapeRun(runId!, [], Date.now() - scrapeStart, [err.message]);
    }

    // Run all requested modules in parallel, passing pre-fetched articles
    const results = await Promise.allSettled(
      modules.map((moduleType) =>
        runModule(evaluationId, moduleType, ico, companyName, prefetchedArticles)
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
  } catch (err: any) {
    log('error', 'Pipeline', `Fatal error for evaluation ${evaluationId}: ${err.message}`);
    await supabase
      .from('evaluations')
      .update({ status: 'failed' })
      .eq('id', evaluationId);
  }
}

function scoreToRiskLevel(score: number | null): string {
  if (score === null) return 'medium';
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'critical';
}

// ============================================================
// Start server
// ============================================================

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  log('info', 'Server', `Pipeline API listening on port ${PORT}`);
});

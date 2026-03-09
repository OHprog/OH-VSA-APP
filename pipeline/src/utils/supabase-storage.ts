import { getSupabase } from './clients';
import { ScrapedArticle } from '../types';
import { log } from './helpers';

// ============================================================
// Firecrawl scrape run tracking
// Mirrors the ScrapeResult / SupplierScrapeResult patterns from
// ACOE3090, storing evaluation-level scrape metadata in Supabase.
// ============================================================

/**
 * Create a "running" scrape run record for an evaluation.
 * Returns the new record's UUID, or null on failure.
 */
export async function startScrapeRun(
  evaluationId: string,
  ico: string,
  companyName: string
): Promise<string | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('firecrawl_scrape_runs')
    .insert({
      evaluation_id: evaluationId,
      supplier_ico: ico,
      company_name: companyName,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) {
    log('error', 'SupabaseStorage', `Failed to start scrape run: ${error.message}`);
    return null;
  }

  return data.id;
}

/**
 * Mark a scrape run as completed (or failed) and record final metrics.
 */
export async function completeScrapeRun(
  runId: string,
  articles: ScrapedArticle[],
  durationMs: number,
  errors: string[]
): Promise<void> {
  if (!runId) return;

  const supabase = getSupabase();

  // Count unique source names scraped
  const uniqueSources = new Set(articles.map((a) => a.source_name)).size;

  const { error } = await supabase
    .from('firecrawl_scrape_runs')
    .update({
      status: errors.length > 0 && articles.length === 0 ? 'failed' : 'completed',
      articles_found: articles.length,
      sources_scraped: uniqueSources,
      duration_ms: durationMs,
      errors: errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    log('error', 'SupabaseStorage', `Failed to complete scrape run ${runId}: ${error.message}`);
  }
}

/**
 * Bulk-insert article records for an evaluation.
 * Stores only a 500-char content snippet — full content stays in MongoDB.
 * runId may be null if startScrapeRun failed — articles are still saved without a scrape_run_id link.
 */
export async function saveArticlesForEvaluation(
  runId: string | null,
  evaluationId: string,
  ico: string,
  articles: ScrapedArticle[]
): Promise<void> {
  if (articles.length === 0) return;

  const supabase = getSupabase();

  const rows = articles.map((a) => ({
    scrape_run_id: runId || null,
    evaluation_id: evaluationId,
    supplier_ico: ico,
    source_name: a.source_name,
    source_url: a.source_url,
    source_type: a.source_type,
    title: a.title || null,
    content_snippet: a.content.slice(0, 500) || null,
    published_at: a.published_at || null,
    scraped_at: a.scraped_at,
    language: a.language || 'cs',
    tags: a.tags,
    supplier_mentions: a.supplier_mentions,
    metadata: a.metadata || {},
  }));

  const { error } = await supabase.from('firecrawl_articles').insert(rows);

  if (error) {
    log('error', 'SupabaseStorage', `Failed to save ${rows.length} articles for evaluation ${evaluationId}: ${error.message}`);
  } else {
    log('info', 'SupabaseStorage', `Saved ${rows.length} Firecrawl articles to Supabase for evaluation ${evaluationId}`);
  }
}

/**
 * Store per-source AI summaries on a completed scrape run.
 * summaries is a map of { source_name: summary_text }.
 */
export async function updateScrapeRunSummaries(
  runId: string,
  summaries: Record<string, string>
): Promise<void> {
  if (!runId || Object.keys(summaries).length === 0) return;

  const supabase = getSupabase();

  const { error } = await supabase
    .from('firecrawl_scrape_runs')
    .update({ source_summaries: summaries })
    .eq('id', runId);

  if (error) {
    log('error', 'SupabaseStorage', `Failed to save source summaries for run ${runId}: ${error.message}`);
  } else {
    log('info', 'SupabaseStorage', `Saved AI summaries for ${Object.keys(summaries).length} sources on run ${runId}`);
  }
}

/**
 * Upsert today's Firecrawl request count into api_usage.
 * Uses request_count to track approximate Firecrawl API calls.
 */
export async function trackFirecrawlUsage(requestCount: number): Promise<void> {
  if (requestCount <= 0) return;

  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Try upsert — increment today's count if row already exists
  const { data: existing } = await supabase
    .from('api_usage')
    .select('id, request_count')
    .eq('service', 'firecrawl')
    .eq('endpoint', 'scrape')
    .eq('date', today)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('api_usage')
      .update({ request_count: existing.request_count + requestCount })
      .eq('id', existing.id);
  } else {
    await supabase.from('api_usage').insert({
      service: 'firecrawl',
      endpoint: 'scrape',
      request_count: requestCount,
      tokens_used: 0,
      date: today,
    });
  }
}

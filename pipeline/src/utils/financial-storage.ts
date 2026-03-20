import { getSupabase } from './clients';
import { log } from './helpers';
import type { FinancialSnapshot, FinancialFigures, FinancialRatios } from '../types';

// ============================================================
// Financial snapshot persistence
// Follows the same pattern as supabase-storage.ts:
//   - getSupabase() client
//   - log() for errors
//   - Never throw — return safe defaults on error
// ============================================================

/**
 * Look up the most recent financial snapshot for an IČO.
 * Returns null if no snapshot exists or if it is older than maxAgeDays (default 90).
 * The 90-day cache means a re-evaluation within the window reuses the same data,
 * ensuring the same score is produced from the same underlying figures.
 */
export async function getFinancialSnapshot(
  ico: string,
  maxAgeDays: number = 90
): Promise<FinancialSnapshot | null> {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - maxAgeDays * 86400 * 1000).toISOString();

  const { data, error } = await supabase
    .from('supplier_financial_snapshots')
    .select('*')
    .eq('supplier_ico', ico)
    .gte('scraped_at', cutoff)
    .order('fiscal_year', { ascending: false })
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log('error', 'FinancialStorage', `Failed to look up snapshot for ${ico}: ${error.message}`);
    return null;
  }

  if (!data) return null;

  return dbRowToSnapshot(data);
}

/**
 * Upsert a financial snapshot.
 * If a row for (supplier_ico, fiscal_year) already exists, it is updated in place.
 * Returns the snapshot UUID, or empty string on failure.
 */
export async function saveFinancialSnapshot(snapshot: FinancialSnapshot): Promise<string> {
  const supabase = getSupabase();
  const row = snapshotToDbRow(snapshot);

  const { data, error } = await supabase
    .from('supplier_financial_snapshots')
    .upsert(row, { onConflict: 'supplier_ico,fiscal_year' })
    .select('id')
    .single();

  if (error) {
    log('error', 'FinancialStorage', `Failed to save snapshot for ${snapshot.supplier_ico} (${snapshot.fiscal_year}): ${error.message}`);
    return '';
  }

  log('info', 'FinancialStorage', `Saved financial snapshot for ${snapshot.supplier_ico} — fiscal year ${snapshot.fiscal_year} (id: ${data.id})`);
  return data.id as string;
}

/**
 * Create a 1:1 link between an evaluation and the snapshot it used.
 * Idempotent: if the link already exists it is left unchanged (ignoreDuplicates).
 * Non-critical: errors are logged but never thrown.
 */
export async function linkEvaluationToSnapshot(
  evaluationId: string,
  snapshotId: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('evaluation_financial_links')
    .upsert(
      { evaluation_id: evaluationId, snapshot_id: snapshotId },
      { onConflict: 'evaluation_id', ignoreDuplicates: true }
    );

  if (error) {
    log('error', 'FinancialStorage', `Failed to link evaluation ${evaluationId} to snapshot ${snapshotId}: ${error.message}`);
  }
}

/**
 * Return all snapshots for an IČO ordered by fiscal_year DESC.
 * Used for historical trend analysis and comparison views.
 */
export async function getSnapshotHistory(ico: string): Promise<FinancialSnapshot[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('supplier_financial_snapshots')
    .select('*')
    .eq('supplier_ico', ico)
    .order('fiscal_year', { ascending: false });

  if (error) {
    log('error', 'FinancialStorage', `Failed to fetch snapshot history for ${ico}: ${error.message}`);
    return [];
  }

  return (data || []).map(dbRowToSnapshot);
}

// ============================================================
// DB ↔ TypeScript mapping helpers
// DB stores figures and ratios as flat columns.
// TypeScript nests them into figures:{} and ratios:{} objects.
// ============================================================

function dbRowToSnapshot(row: Record<string, any>): FinancialSnapshot {
  const figures: FinancialFigures = {
    revenue:             row.revenue ?? null,
    operating_profit:    row.operating_profit ?? null,
    net_profit:          row.net_profit ?? null,
    total_assets:        row.total_assets ?? null,
    equity:              row.equity ?? null,
    total_liabilities:   row.total_liabilities ?? null,
    current_assets:      row.current_assets ?? null,
    current_liabilities: row.current_liabilities ?? null,
  };

  const ratios: FinancialRatios = {
    profit_margin:  row.profit_margin ?? null,
    equity_ratio:   row.equity_ratio ?? null,
    current_ratio:  row.current_ratio ?? null,
    debt_to_equity: row.debt_to_equity ?? null,
    roa:            row.roa ?? null,
  };

  return {
    id:             row.id,
    supplier_ico:   row.supplier_ico,
    company_name:   row.company_name,
    fiscal_year:    row.fiscal_year,
    source_url:     row.source_url ?? null,
    document_type:  row.document_type ?? null,
    scraped_at:     row.scraped_at,
    data_complete:  row.data_complete ?? false,
    figures,
    ratios,
    raw_extraction: row.raw_extraction ?? {},
  };
}

function snapshotToDbRow(snapshot: FinancialSnapshot): Record<string, any> {
  return {
    supplier_ico:        snapshot.supplier_ico,
    company_name:        snapshot.company_name,
    fiscal_year:         snapshot.fiscal_year,
    source_url:          snapshot.source_url,
    document_type:       snapshot.document_type,
    scraped_at:          snapshot.scraped_at,
    data_complete:       snapshot.data_complete,
    // Income statement
    revenue:             snapshot.figures.revenue,
    operating_profit:    snapshot.figures.operating_profit,
    net_profit:          snapshot.figures.net_profit,
    // Balance sheet
    total_assets:        snapshot.figures.total_assets,
    equity:              snapshot.figures.equity,
    total_liabilities:   snapshot.figures.total_liabilities,
    current_assets:      snapshot.figures.current_assets,
    current_liabilities: snapshot.figures.current_liabilities,
    // Ratios
    profit_margin:       snapshot.ratios.profit_margin,
    equity_ratio:        snapshot.ratios.equity_ratio,
    current_ratio:       snapshot.ratios.current_ratio,
    debt_to_equity:      snapshot.ratios.debt_to_equity,
    roa:                 snapshot.ratios.roa,
    // Audit
    raw_extraction:      snapshot.raw_extraction,
  };
}

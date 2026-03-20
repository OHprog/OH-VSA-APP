-- Migration: Financial snapshots and evaluation links
-- Stores parsed Czech financial statement KPIs per supplier per fiscal year.
-- Provides deterministic scoring: each evaluation references the exact snapshot used.

-- ============================================================
-- Table: supplier_financial_snapshots
-- One row per supplier (IČO) per fiscal year.
-- Ratios are stored at scrape time (never recomputed on read) — this is the
-- core determinism guarantee: same snapshot → same score, always.
-- ============================================================

CREATE TABLE public.supplier_financial_snapshots (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Supplier identity
  supplier_ico        TEXT NOT NULL,
  company_name        TEXT NOT NULL,
  fiscal_year         INTEGER NOT NULL,

  -- Source metadata
  source_url          TEXT,
  document_type       TEXT,               -- 'ucetni_zaverka' | 'rozvaha' | 'vykaz_zisk_ztrat'
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_complete       BOOLEAN NOT NULL DEFAULT FALSE,  -- FALSE if extraction was partial

  -- Income statement figures (CZK, thousands as filed)
  revenue             NUMERIC(18,2),      -- Tržby celkem
  operating_profit    NUMERIC(18,2),      -- Provozní výsledek hospodaření
  net_profit          NUMERIC(18,2),      -- Výsledek hospodaření za účetní období

  -- Balance sheet figures (CZK, thousands as filed)
  total_assets        NUMERIC(18,2),      -- Aktiva celkem
  equity              NUMERIC(18,2),      -- Vlastní kapitál
  total_liabilities   NUMERIC(18,2),      -- Cizí zdroje
  current_assets      NUMERIC(18,2),      -- Oběžná aktiva
  current_liabilities NUMERIC(18,2),      -- Krátkodobé závazky

  -- Computed ratios (stored, not computed on read — ensures determinism)
  profit_margin       NUMERIC(8,4),       -- net_profit / revenue
  equity_ratio        NUMERIC(8,4),       -- equity / total_assets
  current_ratio       NUMERIC(8,4),       -- current_assets / current_liabilities
  debt_to_equity      NUMERIC(8,4),       -- total_liabilities / equity
  roa                 NUMERIC(8,4),       -- net_profit / total_assets

  -- Raw LLM extraction output (for audit / re-processing)
  raw_extraction      JSONB DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One snapshot per supplier per year (upsert key)
  UNIQUE (supplier_ico, fiscal_year)
);

-- ============================================================
-- Table: evaluation_financial_links
-- 1:1 link between an evaluation and the snapshot it used.
-- UNIQUE(evaluation_id) enforces exactly one snapshot per evaluation.
-- Written with ignoreDuplicates, so re-running an evaluation cannot
-- shift which baseline was referenced — the link is immutable.
-- ============================================================

CREATE TABLE public.evaluation_financial_links (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id   UUID NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  snapshot_id     UUID NOT NULL REFERENCES public.supplier_financial_snapshots(id) ON DELETE RESTRICT,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evaluation_id)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_fin_snapshots_ico
  ON public.supplier_financial_snapshots(supplier_ico);

CREATE INDEX idx_fin_snapshots_ico_year
  ON public.supplier_financial_snapshots(supplier_ico, fiscal_year DESC);

CREATE INDEX idx_fin_snapshots_scraped_at
  ON public.supplier_financial_snapshots(scraped_at DESC);

CREATE INDEX idx_fin_links_evaluation
  ON public.evaluation_financial_links(evaluation_id);

CREATE INDEX idx_fin_links_snapshot
  ON public.evaluation_financial_links(snapshot_id);

-- ============================================================
-- updated_at trigger function (CREATE OR REPLACE — safe to re-run)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_supplier_financial_snapshots_updated_at
  BEFORE UPDATE ON public.supplier_financial_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Row Level Security
-- Authenticated users can view; only service role can insert/update.
-- (service_role bypasses RLS by default in Supabase)
-- ============================================================

ALTER TABLE public.supplier_financial_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_financial_links     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view financial snapshots"
  ON public.supplier_financial_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can view financial links"
  ON public.evaluation_financial_links FOR SELECT
  TO authenticated USING (true);

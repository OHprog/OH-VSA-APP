-- Migration: Firecrawl scrape tracking tables
-- Records which articles were fetched by Firecrawl for each evaluation
-- and key scrape-run metrics (duration, article counts, errors).

-- ============================================================
-- Table: firecrawl_scrape_runs
-- One record per evaluation scrape session
-- ============================================================

CREATE TABLE firecrawl_scrape_runs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id   UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  supplier_ico    TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed
  articles_found  INTEGER DEFAULT 0,
  articles_stored INTEGER DEFAULT 0,                -- new records written to MongoDB
  sources_scraped INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  errors          TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- ============================================================
-- Table: firecrawl_articles
-- Individual articles found during an evaluation scrape
-- Full content stays in MongoDB; only a snippet is stored here
-- ============================================================

CREATE TABLE firecrawl_articles (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id     UUID REFERENCES firecrawl_scrape_runs(id) ON DELETE CASCADE,
  evaluation_id     UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  supplier_ico      TEXT NOT NULL,
  source_name       TEXT NOT NULL,
  source_url        TEXT NOT NULL,
  source_type       TEXT NOT NULL,
  title             TEXT,
  content_snippet   TEXT,        -- first 500 chars only
  published_at      TIMESTAMPTZ,
  scraped_at        TIMESTAMPTZ DEFAULT NOW(),
  language          TEXT DEFAULT 'cs',
  tags              TEXT[] DEFAULT '{}',
  supplier_mentions TEXT[] DEFAULT '{}',
  metadata          JSONB DEFAULT '{}'
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_firecrawl_runs_evaluation ON firecrawl_scrape_runs(evaluation_id);
CREATE INDEX idx_firecrawl_runs_ico        ON firecrawl_scrape_runs(supplier_ico);
CREATE INDEX idx_firecrawl_articles_evaluation ON firecrawl_articles(evaluation_id);
CREATE INDEX idx_firecrawl_articles_ico    ON firecrawl_articles(supplier_ico);
CREATE INDEX idx_firecrawl_articles_run    ON firecrawl_articles(scrape_run_id);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE firecrawl_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE firecrawl_articles    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view scrape runs"
  ON firecrawl_scrape_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can view firecrawl articles"
  ON firecrawl_articles FOR SELECT
  TO authenticated
  USING (true);

// ============================================================
// Scraped content types
// ============================================================

export interface ScrapedArticle {
  source_name: string;         // e.g. "Seznam Zprávy", "ARES"
  source_url: string;          // original URL
  source_type: 'news' | 'register' | 'industry' | 'energy' | 'financial' | 'legal';
  title: string;
  content: string;             // cleaned text content
  published_at: string | null; // ISO date string
  scraped_at: string;          // ISO date string
  language: string;            // 'cs' or 'en'
  metadata: Record<string, any>;
  supplier_mentions: string[]; // company names / IČO found in content
  tags: string[];              // categorization tags
}

export interface ArticleEmbedding {
  article_id: string;          // MongoDB ObjectId reference
  source_name: string;
  title: string;
  content_chunk: string;       // text chunk that was embedded
  embedding: number[];         // vector
  supplier_mentions: string[];
  created_at: string;
}

// ============================================================
// ARES API types
// ============================================================

export interface AresCompanyData {
  ico: string;
  company_name: string;
  legal_form: string;
  address: string;
  registration_date: string;
  business_activities: string[];
  financial_statements_url: string | null;
  status: 'active' | 'inactive' | 'in_liquidation';
  raw_data: Record<string, any>;
}

export interface AresFinancialStatement {
  ico: string;
  period: string;            // e.g. "2023"
  document_url: string;
  document_type: string;     // "rozvaha", "výkaz zisku a ztráty", etc.
  filing_date: string;
}

// ============================================================
// Insolvency register types
// ============================================================

export interface InsolvencyRecord {
  ico: string;
  company_name: string;
  case_number: string;
  status: string;            // "active", "resolved", "dismissed"
  filing_date: string;
  court: string;
  details_url: string;
  raw_data: Record<string, any>;
}

// ============================================================
// Energy sector types
// ============================================================

export interface EnergyLicenseData {
  ico: string;
  company_name: string;
  license_type: string;
  license_number: string;
  valid_from: string;
  valid_to: string | null;
  status: string;
  source: 'eru' | 'ote' | 'ceps';
}

// ============================================================
// Financial snapshot types
// ============================================================

export interface FinancialFigures {
  revenue:             number | null;   // Tržby celkem (CZK thousands)
  operating_profit:    number | null;   // Provozní výsledek hospodaření
  net_profit:          number | null;   // Výsledek hospodaření za účetní období
  total_assets:        number | null;   // Aktiva celkem
  equity:              number | null;   // Vlastní kapitál
  total_liabilities:   number | null;   // Cizí zdroje
  current_assets:      number | null;   // Oběžná aktiva
  current_liabilities: number | null;   // Krátkodobé závazky
}

export interface FinancialRatios {
  profit_margin:  number | null;   // net_profit / revenue
  equity_ratio:   number | null;   // equity / total_assets
  current_ratio:  number | null;   // current_assets / current_liabilities
  debt_to_equity: number | null;   // total_liabilities / equity
  roa:            number | null;   // net_profit / total_assets
}

export interface FinancialSnapshot {
  id:             string | null;   // UUID, null before first DB save
  supplier_ico:   string;
  company_name:   string;
  fiscal_year:    number;
  source_url:     string | null;
  document_type:  string | null;
  scraped_at:     string;          // ISO timestamp
  data_complete:  boolean;
  figures:        FinancialFigures;
  ratios:         FinancialRatios;
  raw_extraction: Record<string, any>;
}

// ============================================================
// Scraper configuration
// ============================================================

export interface ScraperConfig {
  name: string;
  source_type: ScrapedArticle['source_type'];
  base_url: string;
  scrape_method: 'firecrawl_crawl' | 'firecrawl_scrape' | 'api_direct';
  // FireCrawl specific
  crawl_options?: {
    max_pages: number;
    include_paths?: string[];
    exclude_paths?: string[];
    allowed_domains?: string[];
  };
  // API specific
  api_options?: {
    endpoints: string[];
    headers?: Record<string, string>;
  };
  // Content language (ISO 639-1 code, e.g. 'cs', 'en')
  language?: string;
  // Scheduling
  schedule: 'hourly' | 'daily' | 'weekly';
  enabled: boolean;
}

// ============================================================
// Pipeline result
// ============================================================

export interface ScrapeResult {
  source: string;
  articles_scraped: number;
  articles_stored: number;
  embeddings_created: number;
  errors: string[];
  duration_ms: number;
}

export interface SupplierScrapeResult {
  ico: string;
  company_name: string;
  ares_data: AresCompanyData | null;
  insolvency_records: InsolvencyRecord[];
  news_articles: ScrapedArticle[];
  energy_licenses: EnergyLicenseData[];
  errors: string[];
}

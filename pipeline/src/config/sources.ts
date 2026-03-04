import { ScraperConfig } from '../types';

// ============================================================
// Czech Registers (API-based, no FireCrawl needed)
// ============================================================

export const ARES_CONFIG = {
  name: 'ARES',
  base_url: 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest',
  endpoints: {
    // Look up company by IČO
    company: (ico: string) =>
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
    // Search by name
    search: (name: string) =>
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat?obchodniJmeno=${encodeURIComponent(name)}`,
  },
  // Sbírka listin (financial statements collection)
  sbirka_listin: {
    base_url: 'https://or.justice.cz/ias/ui/vypis-sl-firma',
    // Requires IČO parameter
    url: (ico: string) =>
      `https://or.justice.cz/ias/ui/vypis-sl-firma?subjektId=${ico}`,
  },
};

export const INSOLVENCY_CONFIG = {
  name: 'Insolvenční rejstřík',
  base_url: 'https://isir.justice.cz',
  search_url: 'https://isir.justice.cz/isir/ueu/vysledek_lustrace.do',
  // FireCrawl scrape - no public API
};

// ============================================================
// Czech News Sources (FireCrawl scraping)
// ============================================================

export const NEWS_SOURCES: ScraperConfig[] = [
  {
    name: 'Seznam Zprávy',
    source_type: 'news',
    base_url: 'https://www.seznamzpravy.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 20,
      include_paths: ['/clanek/*', '/sekce/byznys/*', '/sekce/ekonomika/*'],
      exclude_paths: ['/autor/*', '/tema/*'],
    },
    schedule: 'daily',
    enabled: true,
  },
  {
    name: 'Hospodářské noviny',
    source_type: 'news',
    base_url: 'https://hn.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 20,
      include_paths: ['/c1-*', '/firmy/*', '/finance/*', '/ekonomika/*'],
      exclude_paths: ['/nazory/*', '/autor/*'],
    },
    schedule: 'daily',
    enabled: true,
  },
  {
    name: 'E15',
    source_type: 'news',
    base_url: 'https://www.e15.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 20,
      include_paths: ['/byznys/*', '/ekonomika/*', '/firmy/*'],
      exclude_paths: ['/magazin/*', '/autor/*'],
    },
    schedule: 'daily',
    enabled: true,
  },
  {
    name: 'Forbes CZ',
    source_type: 'news',
    base_url: 'https://forbes.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 15,
      include_paths: ['/byznys/*', '/firmy/*', '/miliardar/*'],
      exclude_paths: ['/lifestyle/*', '/autor/*'],
    },
    schedule: 'daily',
    enabled: true,
  },
];

// ============================================================
// Industry Portals (FireCrawl scraping)
// ============================================================

export const INDUSTRY_SOURCES: ScraperConfig[] = [
  {
    name: 'zDopravy.cz',
    source_type: 'industry',
    base_url: 'https://zdopravy.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 15,
      include_paths: ['/*'],
      exclude_paths: ['/autor/*', '/tag/*'],
    },
    schedule: 'daily',
    enabled: true,
  },
  {
    name: 'KamerovýSvět',
    source_type: 'industry',
    base_url: 'https://www.kamerovysvet.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 10,
      include_paths: ['/*'],
    },
    schedule: 'weekly',
    enabled: true,
  },
];

// ============================================================
// Energy Sector Sources
// ============================================================

export const ENERGY_SOURCES: ScraperConfig[] = [
  {
    name: 'ERÚ (Energetický regulační úřad)',
    source_type: 'energy',
    base_url: 'https://www.eru.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 10,
      include_paths: ['/cs/zpravy/*', '/cs/licence/*', '/cs/poze/*'],
    },
    schedule: 'weekly',
    enabled: true,
  },
  {
    name: 'OTE (Operátor trhu s elektřinou)',
    source_type: 'energy',
    base_url: 'https://www.ote-cr.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 10,
      include_paths: ['/cs/aktuality/*', '/cs/statistiky/*'],
    },
    schedule: 'weekly',
    enabled: true,
  },
  {
    name: 'ČEPS',
    source_type: 'energy',
    base_url: 'https://www.ceps.cz',
    scrape_method: 'firecrawl_crawl',
    crawl_options: {
      max_pages: 10,
      include_paths: ['/cs/aktuality/*', '/cs/data/*'],
    },
    schedule: 'weekly',
    enabled: true,
  },
];

// ============================================================
// All sources combined
// ============================================================

export const ALL_FIRECRAWL_SOURCES: ScraperConfig[] = [
  ...NEWS_SOURCES,
  ...INDUSTRY_SOURCES,
  ...ENERGY_SOURCES,
];

// ============================================================
// Supplier name patterns for mention detection
// ============================================================
// These are used to detect company mentions in scraped articles.
// The pipeline also checks against supplier names in Supabase.

export const KNOWN_COMPANY_PATTERNS = [
  // Telecom
  { pattern: /\bCETIN\b/gi, normalized: 'CETIN a.s.' },
  { pattern: /\bO2\b|\bO2 Czech/gi, normalized: 'O2 Czech Republic a.s.' },
  { pattern: /\bT-Mobile\b/gi, normalized: 'T-Mobile Czech Republic a.s.' },
  { pattern: /\bVodafone\b/gi, normalized: 'Vodafone Czech Republic a.s.' },
  // Energy
  { pattern: /\bČEZ\b|\bCEZ\b/gi, normalized: 'ČEZ, a. s.' },
  { pattern: /\bE\.ON\b|\bEON\b/gi, normalized: 'E.ON Energie, a.s.' },
  { pattern: /\binnogy\b|RWE/gi, normalized: 'innogy Energie, s.r.o.' },
  { pattern: /\bPRE\b|Pražská energetika/gi, normalized: 'Pražská energetika, a.s.' },
  // Automotive
  { pattern: /\bŠkoda Auto\b|\bSkoda Auto\b/gi, normalized: 'ŠKODA AUTO a.s.' },
  { pattern: /\bHyundai\b/gi, normalized: 'Hyundai Motor Manufacturing Czech s.r.o.' },
  // Construction / Infra
  { pattern: /\bMetrostav\b/gi, normalized: 'Metrostav a.s.' },
  { pattern: /\bEurovia\b/gi, normalized: 'Eurovia CS, a.s.' },
  { pattern: /\bSkanska\b/gi, normalized: 'Skanska a.s.' },
];

// Czech IČO pattern (8 digits)
export const ICO_PATTERN = /\b\d{8}\b/g;

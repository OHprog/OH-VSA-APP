import { ScraperConfig, ScrapedArticle, ScrapeResult } from '../types';
import { getFireCrawl } from '../utils/clients';
import {
  cleanText, extractTitle, chunkText, detectSupplierMentions,
  generateEmbeddings, log, sleep,
} from '../utils/helpers';
import { storeArticles, storeEmbeddings } from '../utils/storage';
import { ArticleEmbedding } from '../types';
import {
  NEWS_SOURCES, INDUSTRY_SOURCES, ENERGY_SOURCES, ALL_FIRECRAWL_SOURCES,
} from '../config/sources';

// ============================================================
// FireCrawl Web Scraper
// Handles all web scraping: news, industry portals, energy sites
// ============================================================

/**
 * Scrape a single source using FireCrawl crawl mode.
 * Crawls the site following configured paths and page limits.
 */
export async function scrapeSource(config: ScraperConfig): Promise<ScrapeResult> {
  const startTime = Date.now();
  const result: ScrapeResult = {
    source: config.name,
    articles_scraped: 0,
    articles_stored: 0,
    embeddings_created: 0,
    errors: [],
    duration_ms: 0,
  };

  if (!config.enabled) {
    log('info', 'Scraper', `Skipping disabled source: ${config.name}`);
    return result;
  }

  log('info', 'Scraper', `Starting crawl of ${config.name} (${config.base_url})`);

  try {
    const firecrawl = getFireCrawl();

    if (config.scrape_method === 'firecrawl_crawl') {
      // Crawl mode - follows links within the site
      const crawlResponse = await firecrawl.crawlUrl(config.base_url, {
        limit: config.crawl_options?.max_pages || 10,
        includePaths: config.crawl_options?.include_paths,
        excludePaths: config.crawl_options?.exclude_paths,
        scrapeOptions: {
          formats: ['markdown'],
        },
      });

      if (!crawlResponse.success) {
        result.errors.push(`Crawl failed: ${crawlResponse.error || 'Unknown error'}`);
        log('error', 'Scraper', `Crawl failed for ${config.name}`);
        return result;
      }

      // Process each crawled page
      const pages = crawlResponse.data || [];
      result.articles_scraped = pages.length;
      log('info', 'Scraper', `Crawled ${pages.length} pages from ${config.name}`);

      const articles: ScrapedArticle[] = [];

      for (const page of pages) {
        if (!page.markdown || page.markdown.length < 100) continue;

        const content = cleanText(page.markdown);
        if (content.length < 100) continue;

        const title = page.metadata?.title || extractTitle(content, page.metadata?.sourceURL || '');
        const mentions = await detectSupplierMentions(content);

        articles.push({
          source_name: config.name,
          source_url: page.metadata?.sourceURL || config.base_url,
          source_type: config.source_type,
          title,
          content,
          published_at: page.metadata?.publishedTime || null,
          scraped_at: new Date().toISOString(),
          language: 'cs',
          metadata: {
            og_title: page.metadata?.ogTitle,
            og_description: page.metadata?.ogDescription,
            description: page.metadata?.description,
            page_status: page.metadata?.statusCode,
          },
          supplier_mentions: mentions,
          tags: extractTags(content, config.source_type),
        });
      }

      // Store articles in MongoDB
      result.articles_stored = await storeArticles(articles);
      log('info', 'Scraper', `Stored ${result.articles_stored} new articles from ${config.name}`);

      // Generate embeddings for articles with supplier mentions or important content
      const articlesToEmbed = articles.filter(
        a => a.supplier_mentions.length > 0 || a.content.length > 500
      );

      if (articlesToEmbed.length > 0) {
        const embeddingCount = await generateArticleEmbeddings(articlesToEmbed);
        result.embeddings_created = embeddingCount;
        log('info', 'Scraper', `Created ${embeddingCount} embeddings from ${config.name}`);
      }

    } else if (config.scrape_method === 'firecrawl_scrape') {
      // Single page scrape mode
      const scrapeResponse = await firecrawl.scrapeUrl(config.base_url, {
        formats: ['markdown'],
      });

      if (scrapeResponse.success && scrapeResponse.markdown) {
        const content = cleanText(scrapeResponse.markdown);
        const mentions = await detectSupplierMentions(content);

        const article: ScrapedArticle = {
          source_name: config.name,
          source_url: config.base_url,
          source_type: config.source_type,
          title: scrapeResponse.metadata?.title || extractTitle(content, config.base_url),
          content,
          published_at: null,
          scraped_at: new Date().toISOString(),
          language: 'cs',
          metadata: scrapeResponse.metadata || {},
          supplier_mentions: mentions,
          tags: extractTags(content, config.source_type),
        };

        result.articles_scraped = 1;
        result.articles_stored = await storeArticles([article]);
      }
    }

  } catch (error: any) {
    result.errors.push(error.message);
    log('error', 'Scraper', `Error scraping ${config.name}: ${error.message}`);
  }

  result.duration_ms = Date.now() - startTime;
  log('info', 'Scraper', `Completed ${config.name} in ${result.duration_ms}ms`);
  return result;
}

// ============================================================
// Batch scraping by category
// ============================================================

/** Scrape all Czech news sources */
export async function scrapeNews(delayBetweenMs = 5000): Promise<ScrapeResult[]> {
  return scrapeSources(NEWS_SOURCES, delayBetweenMs);
}

/** Scrape all industry portals */
export async function scrapeIndustry(delayBetweenMs = 5000): Promise<ScrapeResult[]> {
  return scrapeSources(INDUSTRY_SOURCES, delayBetweenMs);
}

/** Scrape all energy sector sources */
export async function scrapeEnergy(delayBetweenMs = 5000): Promise<ScrapeResult[]> {
  return scrapeSources(ENERGY_SOURCES, delayBetweenMs);
}

/** Scrape ALL FireCrawl sources */
export async function scrapeAll(delayBetweenMs = 5000): Promise<ScrapeResult[]> {
  return scrapeSources(ALL_FIRECRAWL_SOURCES, delayBetweenMs);
}

async function scrapeSources(
  sources: ScraperConfig[],
  delayBetweenMs: number
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const result = await scrapeSource(source);
    results.push(result);

    // Delay between sources to avoid rate limiting
    if (i < sources.length - 1) {
      log('info', 'Scraper', `Waiting ${delayBetweenMs / 1000}s before next source...`);
      await sleep(delayBetweenMs);
    }
  }

  return results;
}

// ============================================================
// On-demand supplier-specific scraping
// ============================================================

/**
 * Search and scrape news about a specific supplier.
 * Uses FireCrawl to search each news source for the company name.
 */
export async function scrapeNewsForSupplier(
  companyName: string,
  ico: string,
  sources: ScraperConfig[] = NEWS_SOURCES
): Promise<ScrapedArticle[]> {
  log('info', 'Scraper', `Searching news for supplier: ${companyName} (${ico})`);
  const allArticles: ScrapedArticle[] = [];

  for (const source of sources) {
    if (!source.enabled) continue;

    try {
      const firecrawl = getFireCrawl();

      // Use FireCrawl map to find relevant URLs, then scrape them
      const mapResult = await firecrawl.mapUrl(source.base_url, {
        search: companyName,
      });

      if (!mapResult.success || !mapResult.links || mapResult.links.length === 0) {
        continue;
      }

      // Scrape top 5 matching URLs
      const urlsToScrape = mapResult.links.slice(0, 5);
      log('info', 'Scraper', `Found ${mapResult.links.length} URLs for "${companyName}" on ${source.name}, scraping top ${urlsToScrape.length}`);

      for (const url of urlsToScrape) {
        try {
          const scrapeResult = await firecrawl.scrapeUrl(url, {
            formats: ['markdown'],
          });

          if (!scrapeResult.success || !scrapeResult.markdown) continue;

          const content = cleanText(scrapeResult.markdown);
          if (content.length < 100) continue;

          // Verify the article actually mentions the company
          const contentLower = content.toLowerCase();
          const nameLower = companyName.toLowerCase();
          if (!contentLower.includes(nameLower) && !content.includes(ico)) continue;

          allArticles.push({
            source_name: source.name,
            source_url: url,
            source_type: source.source_type,
            title: scrapeResult.metadata?.title || extractTitle(content, url),
            content,
            published_at: scrapeResult.metadata?.publishedTime || null,
            scraped_at: new Date().toISOString(),
            language: source.language ?? 'cs',
            metadata: scrapeResult.metadata || {},
            supplier_mentions: [companyName],
            tags: extractTags(content, source.source_type),
          });

          await sleep(1000); // Rate limit between page scrapes
        } catch (err: any) {
          log('warn', 'Scraper', `Failed to scrape ${url}: ${err.message}`);
        }
      }

      await sleep(2000); // Delay between sources
    } catch (error: any) {
      log('warn', 'Scraper', `Failed to search ${source.name} for "${companyName}": ${error.message}`);
    }
  }

  // Store and embed results
  if (allArticles.length > 0) {
    await storeArticles(allArticles);
    await generateArticleEmbeddings(allArticles);
  }

  log('info', 'Scraper', `Found ${allArticles.length} articles about ${companyName}`);
  return allArticles;
}

// ============================================================
// Embedding generation for articles
// ============================================================

async function generateArticleEmbeddings(articles: ScrapedArticle[]): Promise<number> {
  const allEmbeddings: ArticleEmbedding[] = [];

  for (const article of articles) {
    const chunks = chunkText(article.content, 1000, 100);
    if (chunks.length === 0) continue;

    const vectors = await generateEmbeddings(chunks);

    for (let i = 0; i < chunks.length; i++) {
      if (vectors[i] && vectors[i].length > 0) {
        allEmbeddings.push({
          article_id: article.source_url, // Use URL as reference until we have MongoDB _id
          source_name: article.source_name,
          title: article.title,
          content_chunk: chunks[i],
          embedding: vectors[i],
          supplier_mentions: article.supplier_mentions,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  if (allEmbeddings.length > 0) {
    return await storeEmbeddings(allEmbeddings);
  }
  return 0;
}

// ============================================================
// Tag extraction
// ============================================================

function extractTags(content: string, sourceType: string): string[] {
  const tags: string[] = [sourceType];
  const contentLower = content.toLowerCase();

  const tagPatterns: Record<string, RegExp> = {
    'finance': /finanční|tržby|zisk|ztráta|EBITDA|revenue|profit|dividend/i,
    'insolvency': /insolvenc|úpadek|konkur[sz]|exekuc/i,
    'acquisition': /akvizic|převzet|fúz[ie]|merger|acquisition/i,
    'regulation': /regulac|zákon|vyhlášk|směrnic|GDPR|compliance/i,
    'sanctions': /sankc|embargo|blacklist|restricted/i,
    'esg': /ESG|udržiteln|carbon|emis[ie]|klimat|sustainable/i,
    'cyber': /kyber|cyber|hack|bezpečnost|security|breach|ransomware/i,
    'energy': /energi|elektřin|plyn|gas|obnoviteln|solar|wind|jádr/i,
    'telecom': /telekomunikac|5G|optick|broadband|fiber|síť/i,
    'construction': /stavb|stavební|infrastruktur|construction/i,
    'transport': /doprav|transport|logistik|železnic|silnic/i,
    'gdpr': /osobní údaj|GDPR|data protection|ÚOOÚ/i,
    'ipo': /IPO|primární nabídka|burz|akcie|stock/i,
    'layoffs': /propouštění|restrukturalizac|layoff|downsiz/i,
  };

  for (const [tag, pattern] of Object.entries(tagPatterns)) {
    if (pattern.test(contentLower)) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)];
}

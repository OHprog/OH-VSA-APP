import { Collection, Db } from 'mongodb';
import { getMongoDB } from './clients';
import { ScrapedArticle, ArticleEmbedding } from '../types';
import { log } from './helpers';

// ============================================================
// Collection names
// ============================================================

const COLLECTIONS = {
  ARTICLES: 'scraped_articles',
  EMBEDDINGS: 'article_embeddings',
  FINANCIAL_DOCS: 'financial_documents',
  INSOLVENCY: 'insolvency_records',
  ENERGY_LICENSES: 'energy_licenses',
} as const;

// ============================================================
// Initialize collections and indexes
// ============================================================

export async function initializeCollections(): Promise<void> {
  const db = await getMongoDB();

  // Articles collection
  const articles = db.collection(COLLECTIONS.ARTICLES);
  await articles.createIndex({ source_url: 1 }, { unique: true });
  await articles.createIndex({ source_name: 1, scraped_at: -1 });
  await articles.createIndex({ supplier_mentions: 1 });
  await articles.createIndex({ tags: 1 });
  await articles.createIndex({ scraped_at: -1 });

  // Embeddings collection with vector search index
  // NOTE: Vector search index must be created via Atlas UI or API:
  //
  //   Index name: "vector_index"
  //   Field: "embedding"
  //   Type: "vector"
  //   Dimensions: 1536 (for text-embedding-3-small)
  //   Similarity: "cosine"
  //
  const embeddings = db.collection(COLLECTIONS.EMBEDDINGS);
  await embeddings.createIndex({ article_id: 1 });
  await embeddings.createIndex({ supplier_mentions: 1 });
  await embeddings.createIndex({ source_name: 1 });

  // Financial documents
  const financialDocs = db.collection(COLLECTIONS.FINANCIAL_DOCS);
  await financialDocs.createIndex({ ico: 1, period: 1 }, { unique: true });

  // Insolvency records
  const insolvency = db.collection(COLLECTIONS.INSOLVENCY);
  await insolvency.createIndex({ ico: 1 });
  await insolvency.createIndex({ case_number: 1 }, { unique: true });

  // Energy licenses
  const energy = db.collection(COLLECTIONS.ENERGY_LICENSES);
  await energy.createIndex({ ico: 1 });
  await energy.createIndex({ license_number: 1 }, { unique: true });

  log('info', 'MongoDB', 'Collections and indexes initialized');
}

// ============================================================
// Article storage
// ============================================================

export async function storeArticle(article: ScrapedArticle): Promise<string | null> {
  const db = await getMongoDB();
  const collection = db.collection(COLLECTIONS.ARTICLES);

  try {
    // Upsert by source_url to avoid duplicates
    const result = await collection.updateOne(
      { source_url: article.source_url },
      {
        $set: {
          ...article,
          updated_at: new Date().toISOString(),
        },
        $setOnInsert: {
          created_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    if (result.upsertedId) {
      return result.upsertedId.toString();
    }
    return null; // Already existed
  } catch (error: any) {
    log('error', 'MongoDB', `Failed to store article: ${error.message}`);
    return null;
  }
}

export async function storeArticles(articles: ScrapedArticle[]): Promise<number> {
  let stored = 0;
  for (const article of articles) {
    const id = await storeArticle(article);
    if (id) stored++;
  }
  return stored;
}

// ============================================================
// Embedding storage
// ============================================================

export async function storeEmbeddings(embeddings: ArticleEmbedding[]): Promise<number> {
  if (embeddings.length === 0) return 0;

  const db = await getMongoDB();
  const collection = db.collection(COLLECTIONS.EMBEDDINGS);

  try {
    const result = await collection.insertMany(embeddings, { ordered: false });
    return result.insertedCount;
  } catch (error: any) {
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      log('warn', 'MongoDB', `Some embeddings already exist, inserted partial`);
      return error.result?.nInserted || 0;
    }
    log('error', 'MongoDB', `Failed to store embeddings: ${error.message}`);
    return 0;
  }
}

// ============================================================
// Vector search (for RAG queries during evaluation)
// ============================================================

export async function vectorSearch(
  queryEmbedding: number[],
  options: {
    supplierName?: string;
    sourceType?: string;
    limit?: number;
  } = {}
): Promise<any[]> {
  const db = await getMongoDB();
  const collection = db.collection(COLLECTIONS.EMBEDDINGS);
  const { supplierName, sourceType, limit = 10 } = options;

  // Build filter
  const filter: any = {};
  if (supplierName) {
    filter.supplier_mentions = supplierName;
  }
  if (sourceType) {
    filter.source_name = { $regex: sourceType, $options: 'i' };
  }

  try {
    const results = await collection.aggregate([
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 10,
          limit: limit,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        },
      },
      {
        $project: {
          _id: 1,
          article_id: 1,
          source_name: 1,
          title: 1,
          content_chunk: 1,
          supplier_mentions: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]).toArray();

    return results;
  } catch (error: any) {
    log('error', 'MongoDB', `Vector search failed: ${error.message}`);
    return [];
  }
}

// ============================================================
// Query helpers
// ============================================================

export async function getArticlesForSupplier(
  supplierName: string,
  limit = 50
): Promise<ScrapedArticle[]> {
  const db = await getMongoDB();
  const collection = db.collection<ScrapedArticle>(COLLECTIONS.ARTICLES);

  return collection
    .find({ supplier_mentions: supplierName })
    .sort({ scraped_at: -1 })
    .limit(limit)
    .toArray();
}

export async function getRecentArticles(
  sourceName: string,
  hours = 24,
  limit = 100
): Promise<ScrapedArticle[]> {
  const db = await getMongoDB();
  const collection = db.collection<ScrapedArticle>(COLLECTIONS.ARTICLES);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  return collection
    .find({ source_name: sourceName, scraped_at: { $gte: since } })
    .sort({ scraped_at: -1 })
    .limit(limit)
    .toArray();
}

export async function getArticleCount(): Promise<Record<string, number>> {
  const db = await getMongoDB();
  const collection = db.collection(COLLECTIONS.ARTICLES);

  const pipeline = [
    { $group: { _id: '$source_name', count: { $sum: 1 } } },
    { $sort: { count: -1 as const } },
  ];

  const results = await collection.aggregate(pipeline).toArray();
  const counts: Record<string, number> = {};
  for (const r of results) {
    counts[r._id] = r.count;
  }
  return counts;
}

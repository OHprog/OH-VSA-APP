import { getSupabase, getAIML } from './clients';
import { KNOWN_COMPANY_PATTERNS, ICO_PATTERN } from '../config/sources';

// ============================================================
// Supplier mention detection
// ============================================================

/**
 * Detect supplier mentions in text using:
 * 1. Known company patterns (regex)
 * 2. Supplier names from Supabase database
 * 3. IČO number matches
 */
export async function detectSupplierMentions(text: string): Promise<string[]> {
  const mentions = new Set<string>();

  // 1. Check known patterns
  for (const { pattern, normalized } of KNOWN_COMPANY_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      mentions.add(normalized);
    }
  }

  // 2. Check IČO numbers against database
  const icoMatches = text.match(ICO_PATTERN) || [];
  if (icoMatches.length > 0) {
    const supabase = getSupabase();
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('company_name, ico')
      .in('ico', icoMatches);

    if (suppliers) {
      for (const s of suppliers) {
        mentions.add(s.company_name);
      }
    }
  }

  // 3. Check supplier names from database (fuzzy)
  // Only load once per pipeline run
  if (!cachedSupplierNames) {
    await loadSupplierNames();
  }
  for (const name of cachedSupplierNames) {
    // Simple substring match (case-insensitive)
    if (text.toLowerCase().includes(name.toLowerCase()) && name.length > 3) {
      mentions.add(name);
    }
  }

  return Array.from(mentions);
}

let cachedSupplierNames: string[] = [];

async function loadSupplierNames(): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('suppliers')
    .select('company_name')
    .eq('is_active', true);
  cachedSupplierNames = data?.map(s => s.company_name) || [];
}

/** Reset cache (call between pipeline runs) */
export function resetSupplierCache(): void {
  cachedSupplierNames = [];
}

// ============================================================
// Text cleaning
// ============================================================

/** Clean scraped HTML/markdown content into plain text */
export function cleanText(raw: string): string {
  return raw
    // Remove markdown links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    // Remove common boilerplate
    .replace(/cookie[s]?\s*(policy|consent|settings)/gi, '')
    .replace(/přihlás(it|ení)\s*se/gi, '')
    .replace(/newsletter|odběr\s*novinek/gi, '')
    .trim();
}

/** Extract a title from markdown/HTML content */
export function extractTitle(content: string, url: string): string {
  // Try markdown h1
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Try first non-empty line
  const firstLine = content.split('\n').find(l => l.trim().length > 10);
  if (firstLine && firstLine.length < 200) return firstLine.trim();

  // Fallback to URL
  return url.split('/').pop()?.replace(/-/g, ' ') || 'Untitled';
}

// ============================================================
// Text chunking (for embeddings)
// ============================================================

/**
 * Split text into chunks suitable for embedding.
 * Tries to split on paragraph boundaries.
 */
export function chunkText(text: string, maxChunkSize = 1000, overlap = 100): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if ((currentChunk + '\n\n' + paragraph).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Keep overlap from end of previous chunk
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.ceil(overlap / 5));
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim().length > 50) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// ============================================================
// Embedding generation via AIML
// ============================================================

/**
 * Generate embeddings for text chunks using AIML API.
 * Uses OpenAI-compatible endpoint.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const aiml = getAIML();

  // Process in batches of 10
  const batchSize = 10;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await aiml.embeddings.create({
        model: 'text-embedding-3-small',  // adjust to your AIML model
        input: batch,
      });

      for (const item of response.data) {
        allEmbeddings.push(item.embedding);
      }
    } catch (error: any) {
      console.error(`❌ Embedding error for batch ${i / batchSize}:`, error.message);
      // Push zero vectors as fallback
      for (const _ of batch) {
        allEmbeddings.push([]);
      }
    }

    // Rate limiting
    if (i + batchSize < texts.length) {
      await sleep(200);
    }
  }

  return allEmbeddings;
}

// ============================================================
// Helpers
// ============================================================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function log(level: 'info' | 'warn' | 'error', source: string, message: string): void {
  const timestamp = new Date().toISOString();
  const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌' }[level];
  console.log(`${prefix} [${timestamp}] [${source}] ${message}`);
}

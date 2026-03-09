import { ScrapedArticle } from '../types';
import { getAIML } from './clients';
import { log } from './helpers';

// Maximum sources and articles per source to summarize (keeps token usage bounded)
const MAX_SOURCES = 6;
const MAX_ARTICLES_PER_SOURCE = 8;
const SNIPPET_CHARS = 300;

const SYSTEM_PROMPT =
  'Jsi analytik obchodní zpravodajství se zaměřením na české firmy. ' +
  'Dostaneš seznam článků z jednoho mediálního zdroje. ' +
  'Napiš 2–3 věty shrnující, co tento zdroj píše o dodavateli. ' +
  'Buď věcný, stručný a piš česky.';

/**
 * Generate a short AI summary (2–3 sentences) for each news source
 * that contributed articles in this scrape run.
 *
 * Returns a map of { source_name: summaryText }.
 * Sources that fail to summarize are skipped and logged as warnings.
 */
export async function generateSourceSummaries(
  articles: ScrapedArticle[]
): Promise<Record<string, string>> {
  // Group articles by source
  const bySource = new Map<string, ScrapedArticle[]>();
  for (const article of articles) {
    const list = bySource.get(article.source_name) ?? [];
    list.push(article);
    bySource.set(article.source_name, list);
  }

  // Pick the top MAX_SOURCES sources (most articles first)
  const sortedSources = [...bySource.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, MAX_SOURCES);

  const summaries: Record<string, string> = {};
  const aiml = getAIML();

  for (const [sourceName, sourceArticles] of sortedSources) {
    try {
      const subset = sourceArticles.slice(0, MAX_ARTICLES_PER_SOURCE);

      const articleLines = subset
        .map((a, i) => {
          const snippet = a.content.slice(0, SNIPPET_CHARS).replace(/\s+/g, ' ').trim();
          return `${i + 1}. ${a.title || '(bez titulku)'}\n   ${snippet}`;
        })
        .join('\n\n');

      const userMessage =
        `Zdroj: ${sourceName}\n` +
        `Počet článků: ${subset.length}\n\n` +
        `Články:\n${articleLines}`;

      const response = await aiml.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });

      const summary = response.choices[0]?.message?.content?.trim();
      if (summary) {
        summaries[sourceName] = summary;
        log('info', 'AISummarizer', `Summarized ${sourceName} (${subset.length} articles)`);
      }
    } catch (err: any) {
      log('warn', 'AISummarizer', `Failed to summarize source "${sourceName}": ${err.message}`);
    }
  }

  return summaries;
}

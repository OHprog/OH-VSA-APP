import { log } from '../utils/helpers';

// ============================================================
// OpenSanctions API — real-time sanctions screening
// Covers: EU Consolidated Sanctions List (eu_fsf), OFAC SDN
// (us_ofac_sdn), UN Security Council (un_sc_sanctions),
// UK OFSI (gb_ofsi), and 100+ other lists.
// Docs: https://www.opensanctions.org/docs/api/
// ============================================================

const OPENSANCTIONS_BASE = 'https://api.opensanctions.org';

// Human-readable labels for the most common dataset IDs
const DATASET_LABELS: Record<string, string> = {
  eu_fsf:           'EU Consolidated Sanctions List',
  us_ofac_sdn:      'OFAC Specially Designated Nationals (SDN)',
  us_ofac_cons:     'OFAC Consolidated Sanctions List',
  un_sc_sanctions:  'UN Security Council Sanctions',
  gb_ofsi_cons:     'UK OFSI Consolidated List',
  ch_seco_sanctions:'Swiss SECO Sanctions',
  ca_dfatd_sema:    'Canadian SEMA Sanctions',
  au_dfat_sanctions:'Australian DFAT Sanctions',
};

export interface SanctionsMatch {
  entity_id: string;
  entity_name: string;
  match_score: number;
  datasets: string[];       // e.g. ['eu_fsf', 'us_ofac_sdn']
  dataset_labels: string[]; // human-readable names
  schema: string;           // 'Organization', 'Person', etc.
  properties: Record<string, any>;
}

export interface SanctionsResult {
  matches: SanctionsMatch[];
  lists_checked: string[];     // dataset IDs that were queried
  lists_checked_labels: string[]; // human-readable
  clean: boolean;              // true = no strong matches
  api_available: boolean;      // false if API call failed
}

/**
 * Screen a company name against real sanctions databases via OpenSanctions API.
 *
 * Returns matches with scores:
 *   >= 0.70 → strong match (treat as sanctioned)
 *   0.50–0.69 → possible match (manual review required)
 *   < 0.50 → no meaningful match
 */
export async function checkSanctionsList(
  companyName: string,
  country?: string
): Promise<SanctionsResult> {
  const apiKey = process.env.OPENSANCTIONS_API_KEY;

  if (!apiKey) {
    log('warn', 'SanctionsScraper', 'OPENSANCTIONS_API_KEY not set — skipping API sanctions check');
    return {
      matches: [],
      lists_checked: [],
      lists_checked_labels: [],
      clean: true,
      api_available: false,
    };
  }

  log('info', 'SanctionsScraper', `Screening "${companyName}" against OpenSanctions`);

  try {
    const body: Record<string, any> = {
      queries: {
        q0: {
          schema: 'Organization',
          properties: {
            name: [companyName],
            ...(country ? { country: [country.toLowerCase()] } : {}),
          },
        },
      },
    };

    const response = await fetch(`${OPENSANCTIONS_BASE}/match/default`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `ApiKey ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      log('warn', 'SanctionsScraper', `OpenSanctions API error ${response.status}: ${text.slice(0, 200)}`);
      return { matches: [], lists_checked: [], lists_checked_labels: [], clean: true, api_available: false };
    }

    const data = await response.json() as {
      responses?: {
        q0?: {
          results?: Array<{
            id: string;
            schema: string;
            properties: Record<string, any>;
            datasets: string[];
            score: number;
          }>;
        };
      };
    };

    const rawResults = data?.responses?.q0?.results ?? [];

    // Collect all unique dataset IDs across all results to show "what was checked"
    const allDatasets = new Set<string>();
    rawResults.forEach((r) => r.datasets?.forEach((d) => allDatasets.add(d)));

    // Only surfaces results with meaningful match scores (>= 0.50)
    const significantMatches: SanctionsMatch[] = rawResults
      .filter((r) => r.score >= 0.50)
      .map((r) => {
        const datasets = r.datasets ?? [];
        return {
          entity_id:     r.id,
          entity_name:   (r.properties?.name?.[0] ?? companyName) as string,
          match_score:   r.score,
          datasets,
          dataset_labels: datasets.map((d) => DATASET_LABELS[d] ?? d),
          schema:        r.schema,
          properties:    r.properties ?? {},
        };
      })
      .sort((a, b) => b.match_score - a.match_score);

    // Always report at minimum these core lists as "checked"
    const coreListIds = ['eu_fsf', 'us_ofac_sdn', 'un_sc_sanctions', 'gb_ofsi_cons'];
    const checkedIds   = Array.from(new Set([...coreListIds, ...Array.from(allDatasets)]));
    const checkedLabels = checkedIds.map((d) => DATASET_LABELS[d] ?? d);

    const hasStrongMatch = significantMatches.some((m) => m.match_score >= 0.70);

    log(
      'info',
      'SanctionsScraper',
      `"${companyName}": ${significantMatches.length} match(es) found (${hasStrongMatch ? 'STRONG MATCH' : 'clean'})`
    );

    return {
      matches: significantMatches,
      lists_checked: checkedIds,
      lists_checked_labels: checkedLabels,
      clean: !hasStrongMatch,
      api_available: true,
    };
  } catch (err: any) {
    log('error', 'SanctionsScraper', `OpenSanctions API call failed: ${err.message}`);
    return { matches: [], lists_checked: [], lists_checked_labels: [], clean: true, api_available: false };
  }
}

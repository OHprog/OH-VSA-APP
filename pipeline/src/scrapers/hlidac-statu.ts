/**
 * Hlídač Státu — Czech Public Contracts & Transparency API
 * https://api.hlidacstatu.cz/Api/v2
 *
 * Queries public contracts by IČO. Returns:
 *  - Total contract count + estimated total value
 *  - Contract value grouped by year (last ~4 years)
 *  - Flagged issues (formal defects, hidden prices, same-party contracts)
 *  - Political connections on active contracts
 *
 * Used by:
 *  - Compliance module  → risk scoring (issues, political links)
 *  - Financial module   → public-sector revenue indicator
 */

import { log } from '../utils/helpers';

const HLIDAC_BASE = 'https://api.hlidacstatu.cz/Api/v2';

export interface HlidacContract {
  idSmlouvy: string;
  predmet: string;
  datumUzavreni: string;
  year: number;
  calculatedPriceWithVATinCZK: number;
  issues: { title: string; importance: number }[];
  sVazbouNaPolitikyAktualni: boolean | null;
  odkaz: string;
}

export interface HlidacYearSummary {
  year: number;
  count: number;
  totalValueCZK: number;
}

export interface HlidacResult {
  total: number;
  contracts: HlidacContract[];
  /** Estimated total value (total_contracts × avg_value_in_sample) */
  estimatedTotalValueCZK: number;
  /** Contract value and count per year from sample */
  byYear: HlidacYearSummary[];
  issueCount: number;
  uniqueIssueTypes: string[];
  politicalConnectionsCount: number;
  hiddenPriceCount: number;
}

export async function checkHlidacStatu(ico: string): Promise<HlidacResult | null> {
  const token = process.env.HLIDAC_STATU_API_TOKEN;
  if (!token) {
    log('warn', 'HlidacStatu', 'HLIDAC_STATU_API_TOKEN not set — skipping');
    return null;
  }

  try {
    // Fetch 2 pages in parallel (50 contracts) for a better year-spread sample
    const fetchPage = async (page: number) => {
      const url = `${HLIDAC_BASE}/smlouvy/hledat?dotaz=ico:${ico}&strana=${page}&razeni=0`;
      const res = await fetch(url, {
        headers: { Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ total: number; results: any[] }>;
    };

    const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)]);
    const allRaw = [...(page1.results ?? []), ...(page2.results ?? [])];
    const total: number = page1.total;

    const contracts: HlidacContract[] = allRaw.map((r: any) => ({
      idSmlouvy: r.identifikator?.idSmlouvy ?? '',
      predmet: r.predmet ?? '',
      datumUzavreni: r.datumUzavreni ?? '',
      year: r.datumUzavreni ? new Date(r.datumUzavreni).getFullYear() : 0,
      calculatedPriceWithVATinCZK: r.calculatedPriceWithVATinCZK ?? 0,
      issues: (r.issues ?? []).map((i: any) => ({ title: i.title ?? '', importance: i.importance ?? 0 })),
      sVazbouNaPolitikyAktualni: r.sVazbouNaPolitikyAktualni ?? null,
      odkaz: r.odkaz ?? '',
    }));

    // Value by year (from sample)
    const yearMap = new Map<number, { count: number; total: number }>();
    for (const c of contracts) {
      if (!c.year) continue;
      const existing = yearMap.get(c.year) ?? { count: 0, total: 0 };
      yearMap.set(c.year, {
        count: existing.count + 1,
        total: existing.total + (c.calculatedPriceWithVATinCZK ?? 0),
      });
    }
    const byYear: HlidacYearSummary[] = Array.from(yearMap.entries())
      .map(([year, v]) => ({ year, count: v.count, totalValueCZK: v.total }))
      .sort((a, b) => a.year - b.year);

    // Estimated total value across all contracts
    const sampleValue = contracts.reduce((s, c) => s + (c.calculatedPriceWithVATinCZK ?? 0), 0);
    const avgPerContract = contracts.length > 0 ? sampleValue / contracts.length : 0;
    const estimatedTotalValueCZK = Math.round(total * avgPerContract);

    // Risk signals
    const issueCount = contracts.reduce((s, c) => s + c.issues.length, 0);
    const uniqueIssueTypes = [...new Set(contracts.flatMap((c) => c.issues.map((i) => i.title)))];
    const politicalConnectionsCount = contracts.filter((c) => c.sVazbouNaPolitikyAktualni).length;
    const hiddenPriceCount = contracts.filter((c) => !c.calculatedPriceWithVATinCZK).length;

    log('info', 'HlidacStatu', `IČO ${ico}: ${total} contracts, est. ${(estimatedTotalValueCZK / 1e6).toFixed(1)}M CZK, ${issueCount} issues, ${politicalConnectionsCount} political links`);

    return {
      total,
      contracts,
      estimatedTotalValueCZK,
      byYear,
      issueCount,
      uniqueIssueTypes,
      politicalConnectionsCount,
      hiddenPriceCount,
    };
  } catch (err: any) {
    log('warn', 'HlidacStatu', `Fetch failed for IČO ${ico}: ${err.message}`);
    return null;
  }
}

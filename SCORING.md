# Scoring System — OH-VSA-APP

> Source of truth: [`pipeline/src/evaluators/moduleEvaluator.ts`](pipeline/src/evaluators/moduleEvaluator.ts)
> Last updated: 2026-03-30

---

## Risk Level Thresholds (shared across all modules)

| Score | Risk Level |
|-------|-----------|
| 80–100 | `low` |
| 60–79 | `medium` |
| 40–59 | `high` |
| 0–39 | `critical` |

The overall evaluation score is the **average across all completed modules**.

---

## Module Scoring Details

### 1. Financial Health

**Method:** Weighted average of 4 components. Pure deterministic function — same inputs always produce the same output. Financial data cached for **90 days** (snapshot reused if available).

**Data sources:**
- Czech: ARES (company registration) + Sbírka listin (financial statements) + Hlídač Státu (public contracts — findings only, no score impact)
- International: OpenCorporates + FMP API / IR pages / Yahoo Finance / web annual reports

| Component | Weight | Thresholds |
|-----------|--------|-----------|
| **Profitability** (profit_margin) | 30% | ≥10% → 100 · ≥5% → 75 · ≥1% → 50 · ≥0% → 30 · negative → 10 · missing → 50 |
| **Liquidity** (current_ratio) | 25% | ≥2.0 → 100 · ≥1.5 → 80 · ≥1.0 → 55 · ≥0.5 → 30 · <0.5 → 10 · missing → 50 |
| **Solvency** (equity_ratio) | 20% | ≥50% → 100 · ≥30% → 75 · ≥10% → 50 · ≥0% → 30 · negative → 5 · missing → 50 |
| **Company Health** (ARES/OC status + age) | 25% | Active+10y → 100 · 5y → 80 · 2y → 65 · <2y → 50 · inactive → 20 · liquidation → 10 |

**Formula:** `score = round(prof×0.30 + liq×0.25 + sol×0.20 + health×0.25)`

---

### 2. Compliance & Legal

**Method:** Starts at **90**, deductions applied.

**Data sources (Czech):** ARES + ISIR (insolvency) + Hlídač Státu (public contracts)
**Data sources (International):** OpenCorporates + FireCrawl web search (AI-extracted violations)

| Condition | Points |
|-----------|--------|
| ARES not found | −15 |
| ARES inactive | −20 |
| ARES in liquidation | −30 |
| No insolvency found | +5 |
| Active insolvency proceeding | −40 each |
| Resolved insolvency | −10 each |
| Hlídač Státu flagged issues | −3 per issue (max −15) |
| Political connections on contracts | −15 |
| Hidden prices on contracts | −5 |
| International: active OC 10y+ | starts at 85 |
| International: regulatory violation (active) | −15 each (max −30) |
| International: regulatory violation (resolved) | −5 each (max −15) |

---

### 3. Sanctions

**Method:** Starts at **90**, deductions applied.

**Data sources:** OpenSanctions API (100+ lists incl. EU, OFAC, UN) + sanctions-tagged news articles

| Condition | Points |
|-----------|--------|
| Strong match on OpenSanctions (≥70% confidence) | → score = **0** |
| Possible match (50–70% confidence) | −40 per match |
| Sanctions-tagged news article | −20 each (max −40) |

---

### 4. Market & Reputation

**Method:** Starts at **70**, keyword sentiment analysis on scraped news articles.

**Data sources:** Czech news (Seznam, HN, E15, Forbes) via FireCrawl pre-scrape

| Condition | Points |
|-----------|--------|
| Positive-signal article (growth, award, acquisition, profit…) | +3 each (max +15) |
| Negative-signal article (fraud, fine, scandal, misconduct…) | −8 each |

Bilingual keyword matching — Czech keywords applied for CZ companies, English always applied.

---

### 5. Environmental & ESG

**Method:** Starts at **70**, ERÚ licence check + news sentiment.

**Data sources:** ERÚ (Czech Energy Regulatory Office licences) + ESG/energy-tagged news

| Condition | Points |
|-----------|--------|
| Active ERÚ energy licence (Czech IČO only) | +5 each (max +15) |
| ESG positive news (sustainability, renewables, net zero…) | +4 each (max +10) |
| ESG negative news (pollution, greenwashing, labor dispute…) | −8 each |

---

### 6. Cyber Security

**Method:** Starts at **80**, news-based only.

**Data sources:** Cyber/GDPR-tagged news articles from pre-scrape

| Condition | Points |
|-----------|--------|
| Cyber or GDPR news article | −15 each |
| High-severity article (ransomware, data breach, data leak) | additional −10 each |

> Note: Absence of public reports does not guarantee strong cyber posture — internal security assessments recommended before contracting.

---

### 7. Internal Assessment

**Status: disabled / Coming Soon**

Fixed score: **70 / medium** — placeholder, no automation. Requires manual input.

---

## Score Floor / Ceiling

All scores are clamped to `[0, 100]` via `clamp()` before storage.

---

## AI Summary Layer

After scoring, each module calls `generateModuleSummary()` (gpt-4o-mini) to produce a human-readable `summary` field. If the AI call fails, a deterministic fallback summary is used. The score itself is **never affected by the AI layer** — it is purely deterministic.

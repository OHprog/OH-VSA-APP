# OH-VSA-APP — Project Context for Claude

## What This App Does
Supplier risk evaluation platform for CETIN a.s. Analysts search for Czech suppliers (by name or IČO), run multi-module risk assessments (financial, compliance, sanctions, market, ESG, cyber), and get scored reports. The pipeline scrapes Czech news/registries and feeds findings into evaluations stored in Supabase.

---

## Git Repository

**This project has its own dedicated git repo — separate from oh_persrepo:**

```
https://github.com/OHprog/OH-VSA-APP.git
```

Local path: `oh_persrepo/OH-VSA-APP/` contains a nested `.git` folder.
Always `cd OH-VSA-APP` before running git commands — do NOT use the oh_persrepo root git.

To deploy changes: commit and push to `main` in this repo. GitHub Actions handles the rest automatically.

---

## Deployment

| Component | URL | Hosting |
|-----------|-----|---------|
| Frontend | `https://agreeable-pebble-0e9fcc610.6.azurestaticapps.net` | Azure Static Web Apps |
| Pipeline API | `https://vsa-pipeline.azurewebsites.net` | Azure App Service |
| Database | `https://mhmflwuztabcqchmxjnp.supabase.co` | Supabase |

**GitHub Actions** handles all deployments on push to `main`:
- `pipeline/**` changes → `.github/workflows/deploy-pipeline.yml` → Azure App Service
- `frontend/**` changes → `.github/workflows/deploy-frontend.yml` → Azure Static Web Apps

The corporate proxy (`http://internet.cetin:8080`) is only used for **local development** in `pipeline/.env`. It is NOT set on Azure App Service.

---

## Architecture

```
OH-VSA-APP/
├── frontend/          # React + Vite + TypeScript + Tailwind + shadcn/ui
│   ├── src/pages/     # Dashboard, Admin, Evaluations, Suppliers, NewEvaluation
│   ├── src/hooks/     # useAuth.tsx (Supabase auth + role), use-toast
│   ├── src/integrations/supabase/  # client.ts, types.ts
│   └── supabase/migrations/        # All DB migrations (apply in order)
└── pipeline/          # Node.js + TypeScript — deployed to Azure App Service
    ├── src/api/server.ts            # Express API (POST /evaluate, GET /health)
    ├── src/config/sources.ts        # FireCrawl scraper configs + ARES/Insolvency
    ├── src/scrapers/firecrawl-scraper.ts
    ├── src/evaluators/moduleEvaluator.ts
    └── .env                         # Local dev secrets only (NOT used on Azure)
```

---

## Evaluation Trigger Flow

```
User clicks "Launch" in frontend (Azure Static Web App)
  → supabase.rpc("create_evaluation") creates evaluation + modules (status: queued)
  → DB trigger on_evaluation_insert fires net.http_post
  → run-evaluation Edge Function (Supabase) fetches supplier + module list
  → POST https://vsa-pipeline.azurewebsites.net/evaluate
  → Pipeline sets evaluation → running, runs pre-scrape (90s timeout), runs all modules in parallel
  → Modules update status: queued → running → completed/failed
```

**Key files:**
- `frontend/supabase/functions/run-evaluation/index.ts` — Edge Function (deployed, verify_jwt: false)
- `pipeline/src/api/server.ts` — `/evaluate` endpoint + `runEvaluationPipeline()`
- Migration `20260309000001` — DB trigger `on_evaluation_insert` calling the Edge Function

**Edge Function secret:** `PIPELINE_API_URL=https://vsa-pipeline.azurewebsites.net`

---

## Supabase Project
- **URL**: `https://mhmflwuztabcqchmxjnp.supabase.co`
- **Project ref**: `mhmflwuztabcqchmxjnp`
- **Anon key**: in `frontend/.env.local` as `VITE_SUPABASE_PUBLISHABLE_KEY` and `pipeline/.env` as `SUPABASE_ANON_KEY`
- **Service key**: in `pipeline/.env` as `SUPABASE_SERVICE_KEY` (bypasses RLS — use for debugging)

### Useful curl pattern for debugging Supabase (use corporate proxy):
```bash
curl -s -x http://internet.cetin:8080 "https://mhmflwuztabcqchmxjnp.supabase.co/rest/v1/<table>?select=*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python -m json.tool
```

### Management API (for secrets, functions, SQL):
```bash
curl -s -x http://internet.cetin:8080 "https://api.supabase.com/v1/projects/mhmflwuztabcqchmxjnp/..." \
  -H "Authorization: Bearer sbp_c0431d16f9c1df87b64ee74b479f55041e1db457"

# Run SQL directly:
curl -s -x http://internet.cetin:8080 -X POST \
  "https://api.supabase.com/v1/projects/mhmflwuztabcqchmxjnp/database/query" \
  -H "Authorization: Bearer sbp_c0431d16f9c1df87b64ee74b479f55041e1db457" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT ..."}'
```

---

## Key Database Objects

| Object | Type | Notes |
|--------|------|-------|
| `suppliers` | table | Czech companies, keyed by IČO (nullable for foreign companies) |
| `evaluations` | table | Risk assessments; `overall_risk_level` is an enum stored **lowercase** |
| `evaluation_modules` | table | Per-module results; status: queued → running → completed/failed |
| `data_sources` | table | 20 active sources (news, registries, sanctions) |
| `user_roles` | table | `admin`, `analyst`, `viewer`, `plebian` — app-level roles |
| `profiles` | table | User display names, `is_active` flag |
| `dashboard_stats` | view | Aggregate stats — uses `security_invoker = off` + `overall_risk_level::text` cast |
| `evaluation_list` | view | Joined eval+supplier view — uses `security_invoker = off` |
| `get_monthly_evaluation_stats` | function | `SECURITY DEFINER`, groups evals by month |
| `firecrawl_scrape_runs` | table | One row per evaluation scrape session; has `source_summaries JSONB` |
| `firecrawl_articles` | table | Per-article rows with 500-char snippet (full content in MongoDB) |

### Critical conventions:
- `overall_risk_level` is a **PostgreSQL enum**, cast with `::text` for comparisons
- `LOWER()` does **not** work on this enum — use `::text` cast instead
- All views must use `security_invoker = off` (not `on`) to bypass RLS correctly
- Functions that query RLS-protected tables need `SECURITY DEFINER`
- IČO is **nullable** — foreign companies have no Czech IČO; pipeline handles empty IČO gracefully

---

## RLS Notes
- `data_sources`: requires SELECT policy for authenticated users (migration `20260304000001`)
- `dashboard_stats` / `evaluation_list`: were broken with `security_invoker = on` — fixed in `20260304000002`
- When a Supabase query returns `data: [], error: null` silently → almost always an RLS policy issue

---

## Applied Migrations (in order)
```
20260227132925  — base schema (suppliers, evaluations, evaluation_modules)
20260227132939  — ...
20260227135850  — ...
20260227171000  — dashboard_stats view, evaluation_list view, get_monthly_evaluation_stats RPC
20260227171711  — ...
20260227173343  — data_sources table + seed, api_usage, audit_log
20260302121245  — RLS policy fixes
20260302124024  — sample seed data
20260304000000  — patch_missing_functions (has_role, user_roles, search_suppliers, create_evaluation)
20260304000001  — fix data_sources SELECT RLS policy
20260304000002  — fix dashboard_stats/evaluation_list views + monthly RPC (security_invoker, risk level casing)
20260304000003  — firecrawl_scrape_runs + firecrawl_articles tables
20260304000004  — source_summaries JSONB column on firecrawl_scrape_runs
20260309000001  — on_evaluation_insert DB trigger → run-evaluation Edge Function
20260320000001  — supplier_financial_snapshots + evaluation_financial_links
20260327000001  — fix create_evaluation: remove ::text cast on audit_log entity_id (uuid column mismatch)
20260327000002  — ref_countries, ref_sectors, ref_prompts reference tables + RLS + seed data
20260327000003  — ALTER TYPE app_role ADD VALUE 'plebian' (dashboard-only role)
```

### Live DB Changes (applied directly, 2026-03-27)

Not in migration files — applied via Management API:
- `handle_new_user` trigger: pins new profiles to CETIN org `4d57d407-6306-4528-b540-68fcdfb25ac0`
- `profiles` SELECT RLS: added `OR get_user_role() = 'admin'::user_role`
- `api_usage` SELECT RLS: simplified to `get_user_role() = 'admin'::user_role` (rows have null org_id)
- All suppliers, evaluations, reports migrated from CETIN Group org → CETIN org
- Deleted seed duplicate suppliers (CETIN a.s. + T-Mobile with `b0000000-...` IDs, 0 evals)
- Supabase `site_url` updated to `https://agreeable-pebble-0e9fcc610.6.azurestaticapps.net`
- Google OAuth enabled (client: `852152171579-bk23u4tl309aued3ble5cn3acralj4l3.apps.googleusercontent.com`)
- `user_role` enum extended with `plebian` (dashboard-only access); applied via migration `20260327000003` — **must be run in Supabase SQL editor if Management API token is unavailable**

## Roles Summary

| Role | Access |
|------|--------|
| `admin` | Full access including Admin portal |
| `analyst` | All pages except Admin |
| `viewer` | All pages except Admin |
| `plebian` | Dashboard only — all other routes redirect to `/` |

`DashboardOnlyRoute` wrapper in `App.tsx` enforces plebian restriction. Sidebar hides non-Dashboard nav items for plebian users.

---

## Pipeline Key Files
- [server.ts](pipeline/src/api/server.ts) — `/evaluate`, `/chat`, `/health`, `/firecrawl-credits` endpoints
- [moduleEvaluator.ts](pipeline/src/evaluators/moduleEvaluator.ts) — 7 modules; use only prefetchedArticles (no per-module fallback scrape)
- [sources.ts](pipeline/src/config/sources.ts) — All scraper configs (ARES, Insolvency, news, industry, energy)
- [supabase-storage.ts](pipeline/src/utils/supabase-storage.ts) — trackApiUsage ($0.30/1M tokens blended), trackFirecrawlUsage ($0.01/req)
- [.env](pipeline/.env) — Local dev secrets; corporate proxy set here for local use only

## Frontend Key Files
- [Admin.tsx](frontend/src/pages/Admin.tsx) — Users / Data Sources / System tabs (Firecrawl credits card, api_usage chart)
- [Dashboard.tsx](frontend/src/pages/Dashboard.tsx) — Stats cards, charts, AI chat (suggested prompts from ref_prompts)
- [Suppliers.tsx](frontend/src/pages/Suppliers.tsx) — Supplier CRUD; includes dic/VAT field; countries+sectors from DB
- [NewEvaluation.tsx](frontend/src/pages/NewEvaluation.tsx) — Calls `create_evaluation` RPC; countries+sectors from DB
- [Login.tsx](frontend/src/pages/Login.tsx) — Email + Google OAuth sign-in
- [Register.tsx](frontend/src/pages/Register.tsx) — Email + Google OAuth sign-up
- [useAuth.tsx](frontend/src/hooks/useAuth.tsx) — Auth context; `isAdmin`, `isAnalyst`, `isPlebian` flags from `user_roles` table
- [useReferenceData.ts](frontend/src/hooks/useReferenceData.ts) — Fetches ref_countries, ref_sectors, ref_prompts; module-level cache

## Organisations (IMPORTANT)

Two orgs exist. All real data is in **CETIN** (`4d57d407-6306-4528-b540-68fcdfb25ac0`).
CETIN Group (`a0000000-...`) is a legacy seed org — ignore it.
If RLS queries return empty, check that the row's `organization_id` matches the user's org.
`handle_new_user` trigger is pinned to CETIN org — do not change to dynamic lookup.

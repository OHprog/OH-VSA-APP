# OH-VSA-APP — Project Context for Claude

## What This App Does
Supplier risk evaluation platform for CETIN a.s. Analysts search for Czech suppliers (by name or IČO), run multi-module risk assessments (financial, compliance, sanctions, market, ESG, cyber), and get scored reports. The pipeline scrapes Czech news/registries and feeds findings into evaluations stored in Supabase.

---

## Architecture

```
OH-VSA-APP/
├── frontend/          # React + Vite + TypeScript + Tailwind + shadcn/ui
│   ├── src/pages/     # Dashboard, Admin, Evaluations, Suppliers, NewEvaluation
│   ├── src/hooks/     # useAuth.tsx (Supabase auth + role), use-toast
│   ├── src/integrations/supabase/  # client.ts, types.ts
│   └── supabase/migrations/        # All DB migrations (apply in order)
└── pipeline/          # Node.js + TypeScript
    ├── src/config/sources.ts        # FireCrawl scraper configs + ARES/Insolvency
    ├── src/scrapers/firecrawl-scraper.ts
    ├── src/api/server.ts            # Express API on port 3001
    └── .env                         # All secrets (Supabase, FireCrawl, MongoDB, AIML)
```

---

## Supabase Project
- **URL**: `https://mhmflwuztabcqchmxjnp.supabase.co`
- **Project ref**: `mhmflwuztabcqchmxjnp`
- **Anon key**: in `frontend/.env.local` as `VITE_SUPABASE_PUBLISHABLE_KEY` and `pipeline/.env` as `SUPABASE_ANON_KEY`
- **Service key**: in `pipeline/.env` as `SUPABASE_SERVICE_KEY` (bypasses RLS — use for debugging)

### Useful curl pattern for debugging Supabase:
```bash
curl -s "https://mhmflwuztabcqchmxjnp.supabase.co/rest/v1/<table>?select=*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python -m json.tool
```

---

## Key Database Objects

| Object | Type | Notes |
|--------|------|-------|
| `suppliers` | table | Czech companies, keyed by IČO |
| `evaluations` | table | Risk assessments; `overall_risk_level` is an enum stored **lowercase** (`low`, `medium`, `high`, `critical`) |
| `evaluation_modules` | table | Per-module results (financial, compliance, etc.) |
| `data_sources` | table | 20 active sources (news, registries, sanctions) |
| `user_roles` | table | `admin`, `analyst`, `viewer` — app-level roles |
| `profiles` | table | User display names, `is_active` flag |
| `dashboard_stats` | view | Aggregate stats — uses `security_invoker = off` + `overall_risk_level::text` cast |
| `evaluation_list` | view | Joined eval+supplier view — uses `security_invoker = off` |
| `get_monthly_evaluation_stats` | function | `SECURITY DEFINER`, groups evals by month |

### Critical conventions:
- `overall_risk_level` is a **PostgreSQL enum**, cast with `::text` for comparisons (e.g. `overall_risk_level::text = 'medium'`)
- `LOWER()` does **not** work on this enum — use `::text` cast instead
- All views must use `security_invoker = off` (not `on`) to bypass RLS correctly
- Functions that query RLS-protected tables need `SECURITY DEFINER`

---

## RLS Notes
- `data_sources`: requires policy `"Authenticated can view data sources" FOR SELECT TO authenticated USING (true)` — was missing from live DB, fixed in migration `20260304000001`
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
```

---

## Frontend Key Files
- [Admin.tsx](frontend/src/pages/Admin.tsx) — Users / Data Sources / System tabs; fetches on mount + tab switch
- [Dashboard.tsx](frontend/src/pages/Dashboard.tsx) — Stats cards, charts, recent evaluations
- [useAuth.tsx](frontend/src/hooks/useAuth.tsx) — Auth context; `isAdmin` = role from `user_roles` table

## Pipeline Key Files
- [sources.ts](pipeline/src/config/sources.ts) — All scraper configs (ARES, Insolvency, news, industry, energy)
- [.env](pipeline/.env) — Supabase keys, FireCrawl, MongoDB, AIML API, corporate proxy

---

## Corporate Proxy
All outbound HTTP from the pipeline goes through `http://internet.cetin:8080` (set in `pipeline/.env`).

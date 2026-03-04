# OH-VSA-APP — Vendor Supplier Assessment

Full-stack supplier risk evaluation application.

```
OH-VSA-APP/
├── frontend/   React/Vite app (shadcn/ui + Supabase)
└── pipeline/   Node.js evaluation pipeline (Express API + scrapers)
```

## Quick Start

### 1. Frontend
```bash
cd frontend
cp .env.example .env.local   # add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                  # http://localhost:8080
```

### 2. Pipeline API
```bash
cd pipeline
cp .env.example .env         # add all API keys (see below)
npm install
npm run dev                  # http://localhost:3001
```

### 3. Supabase — run migrations
```bash
cd frontend
supabase db push             # applies all migrations to your linked project
```

### 4. Supabase — deploy Edge Function
```bash
cd frontend
supabase functions deploy run-evaluation
supabase secrets set PIPELINE_API_URL=http://localhost:3001
```

### 5. Register DB Webhook
In Supabase Dashboard → Database → Webhooks → Create:
- Table: `evaluations`, Event: `INSERT`
- URL: `https://<project>.supabase.co/functions/v1/run-evaluation`

---

## Environment Variables

### `frontend/.env.local`
| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |

### `pipeline/.env`
| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `FIRECRAWL_API_KEY` | FireCrawl API key |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | MongoDB database name (default: `supplier-eval`) |
| `AIML_API_KEY` | AIML API key (OpenAI-compatible, for embeddings) |
| `PORT` | Pipeline API port (default: `3001`) |

---

## How It Works

1. User creates an evaluation in the frontend
2. Supabase DB webhook fires → `run-evaluation` Edge Function
3. Edge Function calls `POST /evaluate` on the pipeline API
4. Pipeline runs scrapers in parallel per module:
   - **financial** → ARES Czech Business Register
   - **compliance** → ARES + ISIR Insolvency Register
   - **sanctions** → ISIR + sanctions-tagged news
   - **market** → Czech news (Seznam, HN, E15, Forbes)
   - **esg** → Energy licences (ERÚ) + ESG news
   - **cyber** → Cyber/GDPR-tagged news
   - **internal** → Manual (no automation)
5. Results written to Supabase `evaluation_modules` in real-time
6. Frontend updates live via Supabase Realtime subscriptions

/**
 * Applies the patch SQL migration via Supabase Management API.
 * Usage: ts-node src/apply-migration.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
 * The Supabase project ref is extracted from the URL.
 */
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

const SQL_FILE = path.join(
  __dirname,
  '../../frontend/supabase/migrations/20260304000000_patch_missing_functions.sql'
);

async function applyMigration() {
  const sql = fs.readFileSync(SQL_FILE, 'utf-8');

  console.log(`Applying migration to project: ${projectRef}`);
  console.log(`SQL length: ${sql.length} chars`);

  // Supabase Management API — requires a Management API access token (not service key)
  // As a fallback, we'll POST to the pg REST endpoint via the admin schema
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // For this endpoint, you normally need a Management API PAT.
        // We try with the service key as a fallback (may not work).
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const text = await res.text();
  if (res.ok) {
    console.log('✅ Migration applied successfully');
  } else {
    console.error(`❌ Management API failed (${res.status}): ${text}`);
    console.log('');
    console.log('👉 Apply manually via Supabase Dashboard → SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log('   Paste the contents of:');
    console.log(`   frontend/supabase/migrations/20260304000000_patch_missing_functions.sql`);
  }
}

applyMigration().catch(console.error);

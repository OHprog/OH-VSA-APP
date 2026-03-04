// Supabase Edge Function — run-evaluation
// Triggered by a Database Webhook on: INSERT into public.evaluations
//
// Setup in Supabase Dashboard:
//   Database → Webhooks → Create Webhook
//   Table: evaluations, Event: INSERT
//   URL: https://<project>.supabase.co/functions/v1/run-evaluation
//   HTTP Method: POST
//
// Required Edge Function secrets (set via `supabase secrets set`):
//   PIPELINE_API_URL  — e.g. https://your-pipeline-host.com  or http://localhost:3001 for dev
//   SUPABASE_SERVICE_ROLE_KEY  — auto-injected by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PIPELINE_API_URL = Deno.env.get('PIPELINE_API_URL');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  // Supabase Webhook sends a POST with the new row as JSON body
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (!PIPELINE_API_URL) {
    console.error('[run-evaluation] PIPELINE_API_URL secret is not set');
    return new Response(JSON.stringify({ error: 'PIPELINE_API_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Supabase webhook wraps the new row in `record`
  const evaluation = body.record ?? body;
  const evaluationId: string = evaluation.id;
  const supplierId: string = evaluation.supplier_id;

  if (!evaluationId || !supplierId) {
    console.error('[run-evaluation] Missing evaluation id or supplier_id in webhook payload');
    return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
  }

  console.log(`[run-evaluation] Triggered for evaluation ${evaluationId}`);

  // Fetch supplier details (ico, company_name) and selected modules
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .select('ico, company_name')
    .eq('id', supplierId)
    .single();

  if (supplierError || !supplier) {
    console.error('[run-evaluation] Supplier lookup failed:', supplierError?.message);
    return new Response(JSON.stringify({ error: 'Supplier not found' }), { status: 404 });
  }

  const { data: modules, error: modulesError } = await supabase
    .from('evaluation_modules')
    .select('module_type')
    .eq('evaluation_id', evaluationId);

  if (modulesError) {
    console.error('[run-evaluation] Modules lookup failed:', modulesError.message);
    return new Response(JSON.stringify({ error: 'Modules not found' }), { status: 500 });
  }

  const moduleTypes = (modules ?? []).map((m: { module_type: string }) => m.module_type);

  console.log(`[run-evaluation] Calling pipeline for ${supplier.company_name} (${supplier.ico}), modules: ${moduleTypes.join(', ')}`);

  // Call the pipeline API
  try {
    const pipelineRes = await fetch(`${PIPELINE_API_URL}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evaluation_id: evaluationId,
        ico: supplier.ico,
        company_name: supplier.company_name,
        modules: moduleTypes,
      }),
      // Allow up to 10 seconds for the pipeline to acknowledge
      signal: AbortSignal.timeout(10_000),
    });

    if (!pipelineRes.ok) {
      const text = await pipelineRes.text();
      throw new Error(`Pipeline responded ${pipelineRes.status}: ${text}`);
    }

    const result = await pipelineRes.json();
    console.log(`[run-evaluation] Pipeline acknowledged: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify({ ok: true, evaluation_id: evaluationId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[run-evaluation] Pipeline call failed: ${message}`);

    // Mark evaluation as failed so the UI reflects the error
    await supabase
      .from('evaluations')
      .update({ status: 'failed' })
      .eq('id', evaluationId);

    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

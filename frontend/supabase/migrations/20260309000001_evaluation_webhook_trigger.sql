-- Trigger: call run-evaluation Edge Function on new evaluation INSERT
-- This replaces the manual Supabase Dashboard webhook configuration.
-- The Edge Function fetches supplier details + modules, then calls the pipeline.

CREATE OR REPLACE FUNCTION public.trigger_run_evaluation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://mhmflwuztabcqchmxjnp.supabase.co/functions/v1/run-evaluation',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'record', to_jsonb(NEW),
      'type', 'INSERT',
      'table', 'evaluations',
      'schema', 'public'
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_evaluation_insert ON public.evaluations;

CREATE TRIGGER on_evaluation_insert
  AFTER INSERT ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.trigger_run_evaluation();

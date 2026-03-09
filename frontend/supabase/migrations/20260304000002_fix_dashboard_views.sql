-- Fix 1: dashboard_stats view
--   - Switch to SECURITY DEFINER so it bypasses RLS when called by authenticated users
--   - Fix risk level comparisons to use LOWER() — data stores lowercase ('medium', 'low' etc.)

DROP VIEW IF EXISTS public.dashboard_stats;
DROP VIEW IF EXISTS public.evaluation_list;
DROP FUNCTION IF EXISTS public.get_monthly_evaluation_stats(integer);

CREATE VIEW public.dashboard_stats
WITH (security_invoker = off) AS
SELECT
  (SELECT COUNT(*)::int FROM public.suppliers) AS total_suppliers,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE status = 'running') AS active_evaluations,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE status = 'completed') AS completed_evaluations,
  (SELECT COALESCE(ROUND(AVG(overall_score))::int, 0) FROM public.evaluations WHERE overall_score IS NOT NULL) AS avg_score,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level::text = 'low') AS low_risk_count,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level::text = 'medium') AS medium_risk_count,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level::text = 'high') AS high_risk_count,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level::text = 'critical') AS critical_risk_count;

GRANT SELECT ON public.dashboard_stats TO authenticated;

-- Fix 2: get_monthly_evaluation_stats RPC
--   - Switch to SECURITY DEFINER to bypass RLS
--   - Fix p_months cast: must be text before || concatenation

CREATE FUNCTION public.get_monthly_evaluation_stats(p_months int DEFAULT 12)
RETURNS TABLE(month text, total_evaluations int, avg_score int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    TO_CHAR(date_trunc('month', e.created_at), 'Mon YYYY') AS month,
    COUNT(*)::int AS total_evaluations,
    COALESCE(ROUND(AVG(e.overall_score))::int, 0) AS avg_score
  FROM public.evaluations e
  WHERE e.created_at >= (NOW() - (p_months::text || ' months')::interval)
  GROUP BY date_trunc('month', e.created_at)
  ORDER BY date_trunc('month', e.created_at);
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_evaluation_stats(int) TO authenticated;

-- Fix 3: evaluation_list view
CREATE VIEW public.evaluation_list
WITH (security_invoker = off) AS
SELECT
  e.id,
  e.supplier_id,
  s.company_name,
  s.ico,
  e.status,
  e.overall_score,
  e.overall_risk_level,
  e.created_at,
  e.completed_at,
  e.created_by,
  (SELECT COUNT(*)::int FROM public.evaluation_modules em WHERE em.evaluation_id = e.id) AS module_count,
  (SELECT COUNT(*)::int FROM public.evaluation_modules em WHERE em.evaluation_id = e.id AND em.status = 'completed') AS modules_completed
FROM public.evaluations e
JOIN public.suppliers s ON s.id = e.supplier_id;

GRANT SELECT ON public.evaluation_list TO authenticated;

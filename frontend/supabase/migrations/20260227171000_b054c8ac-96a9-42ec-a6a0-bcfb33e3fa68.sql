
-- Create dashboard_stats view
CREATE OR REPLACE VIEW public.dashboard_stats
WITH (security_invoker = on) AS
SELECT
  (SELECT COUNT(*)::int FROM public.suppliers) AS total_suppliers,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE status = 'running') AS active_evaluations,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE status = 'completed') AS completed_evaluations,
  (SELECT COALESCE(ROUND(AVG(overall_score))::int, 0) FROM public.evaluations WHERE overall_score IS NOT NULL) AS avg_score,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level = 'LOW') AS low_risk_count,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level = 'MEDIUM') AS medium_risk_count,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level = 'HIGH') AS high_risk_count,
  (SELECT COUNT(*)::int FROM public.evaluations WHERE overall_risk_level = 'CRITICAL') AS critical_risk_count;

-- Create evaluation_list view
CREATE OR REPLACE VIEW public.evaluation_list
WITH (security_invoker = on) AS
SELECT
  e.id,
  e.supplier_id,
  s.company_name,
  s.ico,
  e.status,
  e.overall_score,
  e.overall_risk_level,
  e.executive_summary,
  e.created_at,
  e.completed_at,
  e.created_by,
  (SELECT COUNT(*)::int FROM public.evaluation_modules em WHERE em.evaluation_id = e.id) AS module_count,
  (SELECT COUNT(*)::int FROM public.evaluation_modules em WHERE em.evaluation_id = e.id AND em.status = 'completed') AS modules_completed
FROM public.evaluations e
JOIN public.suppliers s ON s.id = e.supplier_id;

-- Create get_monthly_evaluation_stats RPC
CREATE OR REPLACE FUNCTION public.get_monthly_evaluation_stats(p_months int DEFAULT 12)
RETURNS TABLE(month text, total_evaluations int, avg_score int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT
    TO_CHAR(date_trunc('month', e.created_at), 'Mon') AS month,
    COUNT(*)::int AS total_evaluations,
    COALESCE(ROUND(AVG(e.overall_score))::int, 0) AS avg_score
  FROM public.evaluations e
  WHERE e.created_at >= (NOW() - (p_months || ' months')::interval)
  GROUP BY date_trunc('month', e.created_at)
  ORDER BY date_trunc('month', e.created_at);
$$;

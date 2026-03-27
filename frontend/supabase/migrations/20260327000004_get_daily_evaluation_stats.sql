-- Returns per-day evaluation counts and avg scores for the last N days.
-- Used by Dashboard "Evaluations Over Time" chart with time frame picker.

CREATE OR REPLACE FUNCTION public.get_daily_evaluation_stats(p_days integer DEFAULT 30)
RETURNS TABLE(period text, total_evaluations bigint, avg_score numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('day', created_at AT TIME ZONE 'UTC'), 'DD Mon') AS period,
    COUNT(*)::bigint                                                       AS total_evaluations,
    ROUND(AVG(overall_score::numeric), 1)                                  AS avg_score
  FROM public.evaluations
  WHERE created_at >= NOW() - (p_days || ' days')::interval
  GROUP BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
  ORDER BY DATE_TRUNC('day', created_at AT TIME ZONE 'UTC');
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_evaluation_stats(integer) TO authenticated;

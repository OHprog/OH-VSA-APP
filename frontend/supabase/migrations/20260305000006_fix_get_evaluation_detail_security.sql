-- Fix: get_evaluation_detail returns NULL because SECURITY INVOKER
-- causes the org-based RLS policy to filter out the evaluation.
-- SECURITY DEFINER bypasses RLS; the WHERE clause is the access control.

CREATE OR REPLACE FUNCTION public.get_evaluation_detail(p_evaluation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'evaluation', jsonb_build_object(
      'id', e.id,
      'supplier_id', e.supplier_id,
      'company_name', s.company_name,
      'ico', s.ico,
      'sector', s.sector,
      'status', e.status,
      'overall_score', e.overall_score,
      'overall_risk_level', e.overall_risk_level,
      'executive_summary', e.executive_summary,
      'created_at', e.created_at,
      'completed_at', e.completed_at,
      'created_by', e.created_by
    ),
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', em.id,
          'module_type', em.module_type,
          'status', em.status,
          'score', em.score,
          'risk_level', em.risk_level,
          'summary', em.summary,
          'findings', em.findings,
          'sources', em.sources,
          'raw_data', em.raw_data,
          'started_at', em.started_at,
          'completed_at', em.completed_at
        ) ORDER BY em.started_at NULLS LAST
      )
      FROM public.evaluation_modules em
      WHERE em.evaluation_id = e.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.evaluations e
  JOIN public.suppliers s ON s.id = e.supplier_id
  WHERE e.id = p_evaluation_id;

  RETURN v_result;
END;
$$;

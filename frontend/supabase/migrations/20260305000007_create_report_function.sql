-- Fix: reports INSERT blocked by org-based RLS.
-- Wrap in SECURITY DEFINER function that derives organization_id from the evaluation.

CREATE OR REPLACE FUNCTION public.create_report(p_evaluation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_org_id    uuid;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.evaluations
  WHERE id = p_evaluation_id;

  INSERT INTO public.reports (evaluation_id, organization_id, created_by, file_url)
  VALUES (p_evaluation_id, v_org_id, auth.uid(), null)
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

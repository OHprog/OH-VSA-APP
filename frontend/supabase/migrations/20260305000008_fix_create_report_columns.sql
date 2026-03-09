-- Fix: reports uses generated_by not created_by, and generated_at not created_at.

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

  INSERT INTO public.reports (evaluation_id, organization_id, generated_by, generated_at, file_url)
  VALUES (p_evaluation_id, v_org_id, auth.uid(), now(), null)
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

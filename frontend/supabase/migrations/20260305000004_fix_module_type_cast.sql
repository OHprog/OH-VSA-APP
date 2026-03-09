-- Fix: evaluation_modules.module_type is a custom enum, not text.
-- Cast v_module::module_type explicitly on insert.

CREATE OR REPLACE FUNCTION public.create_evaluation(
  p_supplier_id uuid,
  p_module_types text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evaluation_id uuid;
  v_module        text;
  v_org_id        uuid;
BEGIN
  SELECT COALESCE(s.organization_id, p.organization_id) INTO v_org_id
  FROM public.suppliers s
  LEFT JOIN public.profiles p ON p.id = auth.uid()
  WHERE s.id = p_supplier_id;

  INSERT INTO public.evaluations (supplier_id, created_by, organization_id, status)
  VALUES (p_supplier_id, auth.uid(), v_org_id, 'pending')
  RETURNING id INTO v_evaluation_id;

  FOREACH v_module IN ARRAY p_module_types LOOP
    INSERT INTO public.evaluation_modules (evaluation_id, module_type, status)
    VALUES (v_evaluation_id, v_module::module_type, 'queued');
  END LOOP;

  RETURN v_evaluation_id;
END;
$$;

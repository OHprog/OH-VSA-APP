-- Fix: restore SECURITY DEFINER on create_evaluation.
-- SECURITY INVOKER causes RLS to block the INSERT on evaluations
-- because auth.uid() is unavailable in the invoker context.
-- The original design (20260227135850) correctly used SECURITY DEFINER.

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
  v_module text;
BEGIN
  INSERT INTO public.evaluations (supplier_id, created_by, status)
  VALUES (p_supplier_id, auth.uid(), 'pending')
  RETURNING id INTO v_evaluation_id;

  FOREACH v_module IN ARRAY p_module_types LOOP
    INSERT INTO public.evaluation_modules (evaluation_id, module_type, status)
    VALUES (v_evaluation_id, v_module, 'queued');
  END LOOP;

  RETURN v_evaluation_id;
END;
$$;

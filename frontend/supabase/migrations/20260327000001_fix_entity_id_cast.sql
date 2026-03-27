-- Fix: create_evaluation inserts v_evaluation_id::text into audit_log.entity_id
-- but the live DB has entity_id as uuid. Remove the ::text cast so the UUID value
-- is passed directly — compatible with both uuid and text column types.

DROP FUNCTION IF EXISTS public.create_evaluation(uuid, module_type[]);

CREATE FUNCTION public.create_evaluation(
  p_supplier_id   uuid,
  p_module_types  module_type[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evaluation_id uuid;
  v_module        module_type;
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
    VALUES (v_evaluation_id, v_module, 'queued');
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'evaluation.create',
    'evaluation',
    v_evaluation_id,  -- no ::text cast; uuid works for both uuid and text columns
    jsonb_build_object('supplier_id', p_supplier_id, 'modules', p_module_types::text[])
  );

  RETURN v_evaluation_id;
END;
$$;

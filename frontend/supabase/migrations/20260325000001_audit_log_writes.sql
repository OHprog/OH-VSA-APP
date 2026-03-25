-- Allow authenticated users to insert their own audit log entries.
-- The SELECT policy (admins only) is already defined in 20260227173343.
CREATE POLICY "authenticated_can_insert_audit_log"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Performance index for audit log queries ordered by time
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx
  ON public.audit_log (created_at DESC);

-- Update create_evaluation to also write an audit log entry.
-- Must DROP + CREATE (not CREATE OR REPLACE) to handle exact parameter type.
DROP FUNCTION IF EXISTS public.create_evaluation(uuid, text[]);
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
    v_evaluation_id::text,
    jsonb_build_object('supplier_id', p_supplier_id, 'modules', p_module_types::text[])
  );

  RETURN v_evaluation_id;
END;
$$;

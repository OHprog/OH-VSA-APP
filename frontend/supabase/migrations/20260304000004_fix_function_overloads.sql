-- Fix: "could not choose the best candidate function" errors
-- Both create_evaluation and search_suppliers may exist in two conflicting
-- versions in the DB (old auto-generated + patched). Explicit DROP + CREATE
-- removes any ambiguity that CREATE OR REPLACE cannot resolve.

-- ============================================================
-- create_evaluation
-- ============================================================

DROP FUNCTION IF EXISTS public.create_evaluation(uuid, text[]);

CREATE FUNCTION public.create_evaluation(
  p_supplier_id uuid,
  p_module_types text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
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

-- ============================================================
-- search_suppliers
-- (old version returned SETOF supplier_summary with param p_query;
--  new version returns SETOF suppliers with param search_term)
-- ============================================================

DROP FUNCTION IF EXISTS public.search_suppliers(text, integer);
DROP FUNCTION IF EXISTS public.search_suppliers(text, int);

CREATE FUNCTION public.search_suppliers(
  search_term text DEFAULT '',
  p_limit int DEFAULT 10
)
RETURNS SETOF public.suppliers
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.suppliers
  WHERE
    search_term = '' OR
    company_name ILIKE '%' || search_term || '%' OR
    ico ILIKE '%' || search_term || '%'
  ORDER BY company_name
  LIMIT p_limit;
$$;

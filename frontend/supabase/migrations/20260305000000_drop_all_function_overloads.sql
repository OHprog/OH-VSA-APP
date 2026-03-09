-- Drop ALL overloads of create_evaluation and search_suppliers,
-- regardless of how many versions exist or what their exact signatures are.
-- Then recreate exactly one clean version of each.

-- ============================================================
-- Drop ALL create_evaluation overloads dynamically
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'create_evaluation'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ============================================================
-- Drop ALL search_suppliers overloads dynamically
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'search_suppliers'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ============================================================
-- Recreate create_evaluation (single canonical version)
-- ============================================================

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
-- Recreate search_suppliers (single canonical version)
-- ============================================================

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

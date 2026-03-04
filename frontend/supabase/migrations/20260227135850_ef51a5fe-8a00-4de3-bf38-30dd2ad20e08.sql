
-- Add organization_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Add city to suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS city text;

-- Create supplier_summary view
CREATE OR REPLACE VIEW public.supplier_summary
WITH (security_invoker = on) AS
SELECT 
  s.id,
  s.company_name,
  s.ico,
  s.country,
  s.city,
  s.address,
  s.sector,
  s.website_url,
  s.notes,
  s.created_by,
  s.created_at,
  s.updated_at,
  COUNT(e.id)::int AS evaluation_count,
  MAX(e.created_at) AS last_evaluated
FROM public.suppliers s
LEFT JOIN public.evaluations e ON e.supplier_id = s.id
GROUP BY s.id;

-- Create search_suppliers RPC
CREATE OR REPLACE FUNCTION public.search_suppliers(p_query text, p_limit int DEFAULT 20)
RETURNS SETOF public.supplier_summary
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT * FROM public.supplier_summary
  WHERE 
    company_name ILIKE '%' || p_query || '%'
    OR ico ILIKE '%' || p_query || '%'
    OR sector ILIKE '%' || p_query || '%'
    OR city ILIKE '%' || p_query || '%'
  ORDER BY company_name
  LIMIT p_limit;
$$;

-- Create create_evaluation RPC
CREATE OR REPLACE FUNCTION public.create_evaluation(p_supplier_id uuid, p_module_types text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_evaluation_id uuid;
  v_module text;
BEGIN
  INSERT INTO public.evaluations (supplier_id, created_by, status)
  VALUES (p_supplier_id, auth.uid(), 'running')
  RETURNING id INTO v_evaluation_id;

  FOREACH v_module IN ARRAY p_module_types
  LOOP
    INSERT INTO public.evaluation_modules (evaluation_id, module_type, status)
    VALUES (v_evaluation_id, v_module, 'queued');
  END LOOP;

  RETURN v_evaluation_id;
END;
$$;

-- Enable realtime for evaluation_modules
ALTER PUBLICATION supabase_realtime ADD TABLE public.evaluation_modules;

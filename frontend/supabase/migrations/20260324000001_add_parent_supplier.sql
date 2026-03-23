-- ============================================================
-- Add parent company support to suppliers
-- ============================================================

-- 1. Add self-referential FK (nullable; ON DELETE SET NULL so removing a parent
--    simply nulls out the reference on all its subsidiaries)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Guard against a supplier being its own parent
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_no_self_parent CHECK (parent_id <> id);

-- 2. Rebuild supplier_summary to include parent_company_name + subsidiary_count.
--    Mirror current live columns exactly; add 3 new computed columns.
DROP VIEW IF EXISTS public.supplier_summary;

CREATE VIEW public.supplier_summary
WITH (security_invoker = off) AS
SELECT
  s.id,
  s.organization_id,
  s.company_name,
  s.ico,
  s.dic,
  s.country,
  s.address,
  s.city,
  s.postal_code,
  s.sector,
  s.website_url,
  s.contact_email,
  s.contact_phone,
  s.notes,
  s.is_active,
  s.created_by,
  s.created_at,
  s.updated_at,
  -- Parent / subsidiary fields (NEW)
  s.parent_id,
  p.company_name                                                          AS parent_company_name,
  (SELECT COUNT(*)::int FROM public.suppliers c WHERE c.parent_id = s.id) AS subsidiary_count,
  -- Existing computed columns (kept identical to previous view)
  (SELECT COUNT(*) FROM public.evaluations e WHERE e.supplier_id = s.id)  AS evaluation_count,
  (SELECT MAX(e.created_at) FROM public.evaluations e
    WHERE e.supplier_id = s.id)                                            AS last_evaluated_at,
  (SELECT e.overall_score FROM public.evaluations e
    WHERE e.supplier_id = s.id
    ORDER BY e.created_at DESC LIMIT 1)                                    AS latest_score,
  (SELECT e.overall_risk_level FROM public.evaluations e
    WHERE e.supplier_id = s.id
    ORDER BY e.created_at DESC LIMIT 1)                                    AS latest_risk_level
FROM public.suppliers s
LEFT JOIN public.suppliers p ON p.id = s.parent_id;

GRANT SELECT ON public.supplier_summary TO authenticated;

-- 3. Update search_suppliers to return enriched supplier_summary rows
--    (was SETOF suppliers; now SETOF supplier_summary — additive, non-breaking)
DROP FUNCTION IF EXISTS public.search_suppliers(text, integer);

CREATE OR REPLACE FUNCTION public.search_suppliers(
  search_term text DEFAULT '',
  p_limit     int  DEFAULT 10
)
RETURNS SETOF public.supplier_summary
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM   public.supplier_summary
  WHERE  search_term = ''
      OR company_name ILIKE '%' || search_term || '%'
      OR ico          ILIKE '%' || search_term || '%'
  ORDER  BY company_name
  LIMIT  p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_suppliers(text, int) TO authenticated;

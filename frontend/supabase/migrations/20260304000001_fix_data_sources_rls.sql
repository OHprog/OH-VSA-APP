-- Fix: data_sources SELECT policy was missing, causing authenticated users to see no rows.
-- The FOR ALL admin policy alone was insufficient (has_role may not have been applied to live DB).
-- This adds a simple SELECT policy for all authenticated users.

DROP POLICY IF EXISTS "Authenticated can view data sources" ON public.data_sources;

CREATE POLICY "Authenticated can view data sources"
  ON public.data_sources
  FOR SELECT TO authenticated
  USING (true);

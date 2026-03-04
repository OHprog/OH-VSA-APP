
-- Tighten evaluation_modules insert policy
DROP POLICY "Authenticated users can insert modules" ON public.evaluation_modules;
CREATE POLICY "Authenticated users can insert modules" ON public.evaluation_modules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.evaluations e WHERE e.id = evaluation_id AND e.created_by = auth.uid())
  );

-- Tighten evaluation_modules update policy
DROP POLICY "Authenticated users can update modules" ON public.evaluation_modules;
CREATE POLICY "Authenticated users can update modules" ON public.evaluation_modules
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.evaluations e WHERE e.id = evaluation_id)
  );

-- Tighten evaluations update policy
DROP POLICY "Authenticated users can update evaluations" ON public.evaluations;
CREATE POLICY "Authenticated users can update evaluations" ON public.evaluations
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Tighten suppliers update policy
DROP POLICY "Authenticated users can update suppliers" ON public.suppliers;
CREATE POLICY "Authenticated users can update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Tighten reports insert policy
DROP POLICY "Authenticated users can insert reports" ON public.reports;
CREATE POLICY "Authenticated users can insert reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.evaluations e WHERE e.id = evaluation_id)
  );

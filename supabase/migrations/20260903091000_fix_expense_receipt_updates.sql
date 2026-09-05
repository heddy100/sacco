DROP POLICY IF EXISTS "expenses admin update" ON public.expenses;
CREATE POLICY "expenses staff update own or admin" ON public.expenses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR recorded_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR recorded_by = auth.uid());
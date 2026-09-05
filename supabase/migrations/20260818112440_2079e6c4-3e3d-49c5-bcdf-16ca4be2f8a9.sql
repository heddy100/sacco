ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS guarantor1_member_id uuid REFERENCES public.members(id),
  ADD COLUMN IF NOT EXISTS guarantor1_name text,
  ADD COLUMN IF NOT EXISTS guarantor1_contact text,
  ADD COLUMN IF NOT EXISTS guarantor2_member_id uuid REFERENCES public.members(id),
  ADD COLUMN IF NOT EXISTS guarantor2_name text,
  ADD COLUMN IF NOT EXISTS guarantor2_contact text;

UPDATE public.departments SET name = 'Nursery Section' WHERE name = 'Finance';

UPDATE public.loan_products SET savings_multiplier = 3;

INSERT INTO public.system_settings (key, value) VALUES ('share_price', '20000')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

INSERT INTO public.system_settings (key, value) VALUES ('loan_share_multiplier', '3')
ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();

UPDATE public.share_transactions SET price_per_share = 20000 WHERE price_per_share <> 20000;

ALTER TABLE public.share_transactions ALTER COLUMN price_per_share SET DEFAULT 20000;

CREATE POLICY "member photos read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'member-photos');

CREATE POLICY "member photos staff insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos' AND public.is_staff(auth.uid()));

CREATE POLICY "member photos staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'member-photos' AND public.is_staff(auth.uid()));

CREATE POLICY "member photos staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos' AND public.is_staff(auth.uid()));
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_no text NOT NULL UNIQUE DEFAULT ('EX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  expense_date date NOT NULL DEFAULT current_date,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL DEFAULT 'cash',
  carried_by text NOT NULL,
  description text,
  receipt_path text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX idx_expenses_category ON public.expenses(category);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses staff read" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "expenses staff write" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.can_post(auth.uid()));
CREATE POLICY "expenses admin update" ON public.expenses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expenses admin delete" ON public.expenses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "expense receipts staff read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'expense-receipts' AND public.is_staff(auth.uid()));
CREATE POLICY "expense receipts staff insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expense-receipts' AND public.can_post(auth.uid()));
CREATE POLICY "expense receipts admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'expense-receipts' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expense receipts admin delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'expense-receipts' AND public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS registration_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0),
  ADD COLUMN IF NOT EXISTS subscription_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (subscription_fee >= 0);

INSERT INTO public.system_settings (key, value)
VALUES ('registration_fee', '0'), ('subscription_fee', '0'), ('recent_transactions_since', '')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.post_expense_txn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transactions (txn_date, category, direction, amount, method, description, source_table, source_id, created_by)
  VALUES (NEW.expense_date, 'Expense - ' || NEW.category, 'out', NEW.amount, NEW.method,
    COALESCE(NEW.description, NEW.expense_no) || ' | Carried by: ' || NEW.carried_by,
    'expenses', NEW.id, NEW.recorded_by);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_post_expense ON public.expenses;
CREATE TRIGGER trg_post_expense AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.post_expense_txn();

INSERT INTO public.transactions (txn_date, category, direction, amount, method, description, source_table, source_id, created_by)
SELECT e.expense_date, 'Expense - ' || e.category, 'out', e.amount, e.method,
  COALESCE(e.description, e.expense_no) || ' | Carried by: ' || e.carried_by,
  'expenses', e.id, e.recorded_by
FROM public.expenses e
WHERE NOT EXISTS (
  SELECT 1 FROM public.transactions t
  WHERE t.source_table = 'expenses' AND t.source_id = e.id
);

GRANT EXECUTE ON FUNCTION public.post_expense_txn() TO authenticated;
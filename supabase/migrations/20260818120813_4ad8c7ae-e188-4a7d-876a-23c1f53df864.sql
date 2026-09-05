UPDATE public.loan_products SET active = false;

INSERT INTO public.loan_products (name, max_amount, interest_rate, max_period_months, processing_fee_pct, penalty_rate, savings_multiplier, active)
SELECT 'Salary Loan (1.5%)', 100000000, 18, 24, 0, 0, 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.loan_products WHERE name = 'Salary Loan (1.5%)');

UPDATE public.loan_products SET active = true, interest_rate = 18, penalty_rate = 0, processing_fee_pct = 0 WHERE name = 'Salary Loan (1.5%)';
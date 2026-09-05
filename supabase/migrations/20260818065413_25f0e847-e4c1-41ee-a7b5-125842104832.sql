-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','treasurer','committee','member');
CREATE TYPE public.member_status AS ENUM ('active','inactive','suspended','exited');
CREATE TYPE public.savings_type AS ENUM ('deposit','withdrawal');
CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','mobile_money','salary_deduction','cheque','other');
CREATE TYPE public.loan_status AS ENUM ('pending','under_review','approved','rejected','disbursed','completed');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','treasurer','committee'));
$$;

CREATE OR REPLACE FUNCTION public.can_post(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','treasurer'));
$$;

CREATE POLICY "profiles readable by self or staff" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update self or admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "roles readable by self or staff" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

-- signup trigger: first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_admin boolean;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN has_admin THEN 'member'::public.app_role ELSE 'admin'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DEPARTMENTS
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments admin write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- MEMBERS
CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_no text NOT NULL UNIQUE,
  user_id uuid UNIQUE,
  full_name text NOT NULL,
  staff_no text,
  national_id text,
  gender text,
  date_of_birth date,
  phone text,
  email text,
  address text,
  department_id uuid REFERENCES public.departments(id),
  position text,
  join_date date NOT NULL DEFAULT current_date,
  status public.member_status NOT NULL DEFAULT 'active',
  next_of_kin text,
  next_of_kin_phone text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_members_status ON public.members(status);
CREATE INDEX idx_members_dept ON public.members(department_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read staff or own" ON public.members FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "members write admin" ON public.members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.current_member_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1;
$$;

-- SAVINGS
CREATE TABLE public.savings_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no text NOT NULL UNIQUE DEFAULT ('SV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT current_date,
  txn_type public.savings_type NOT NULL,
  category text NOT NULL DEFAULT 'regular',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  description text,
  verified boolean NOT NULL DEFAULT true,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_savings_member ON public.savings_transactions(member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_transactions TO authenticated;
GRANT ALL ON public.savings_transactions TO service_role;
ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "savings read" ON public.savings_transactions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR member_id = public.current_member_id());
CREATE POLICY "savings write" ON public.savings_transactions FOR ALL TO authenticated
  USING (public.can_post(auth.uid())) WITH CHECK (public.can_post(auth.uid()));

-- SHARES
CREATE TABLE public.share_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no text NOT NULL UNIQUE DEFAULT ('SH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT current_date,
  shares integer NOT NULL CHECK (shares <> 0),
  price_per_share numeric(14,2) NOT NULL DEFAULT 10000,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_shares_member ON public.share_transactions(member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_transactions TO authenticated;
GRANT ALL ON public.share_transactions TO service_role;
ALTER TABLE public.share_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shares read" ON public.share_transactions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR member_id = public.current_member_id());
CREATE POLICY "shares write" ON public.share_transactions FOR ALL TO authenticated
  USING (public.can_post(auth.uid())) WITH CHECK (public.can_post(auth.uid()));

-- LOAN PRODUCTS
CREATE TABLE public.loan_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  max_amount numeric(14,2) NOT NULL DEFAULT 5000000,
  interest_rate numeric(6,3) NOT NULL DEFAULT 12,
  max_period_months integer NOT NULL DEFAULT 12,
  processing_fee_pct numeric(6,3) NOT NULL DEFAULT 1,
  penalty_rate numeric(6,3) NOT NULL DEFAULT 2,
  savings_multiplier numeric(6,2) NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_products TO authenticated;
GRANT ALL ON public.loan_products TO service_role;
ALTER TABLE public.loan_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products read" ON public.loan_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products admin write" ON public.loan_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- LOANS
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_no text NOT NULL UNIQUE DEFAULT ('LN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.loan_products(id),
  amount_requested numeric(14,2) NOT NULL CHECK (amount_requested > 0),
  amount_approved numeric(14,2),
  purpose text,
  period_months integer NOT NULL DEFAULT 12,
  interest_rate numeric(6,3) NOT NULL DEFAULT 12,
  status public.loan_status NOT NULL DEFAULT 'pending',
  applied_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  disbursed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_loans_member ON public.loans(member_id);
CREATE INDEX idx_loans_status ON public.loans(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans read" ON public.loans FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR member_id = public.current_member_id());
CREATE POLICY "loans member apply" ON public.loans FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id() AND status = 'pending');
CREATE POLICY "loans staff write" ON public.loans FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- REPAYMENTS
CREATE TABLE public.loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no text NOT NULL UNIQUE DEFAULT ('RP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  loan_id uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  txn_date date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  principal numeric(14,2) NOT NULL DEFAULT 0,
  interest numeric(14,2) NOT NULL DEFAULT 0,
  penalty numeric(14,2) NOT NULL DEFAULT 0,
  method public.payment_method NOT NULL DEFAULT 'salary_deduction',
  reference text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_repay_loan ON public.loan_repayments(loan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_repayments TO authenticated;
GRANT ALL ON public.loan_repayments TO service_role;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "repay read" ON public.loan_repayments FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR member_id = public.current_member_id());
CREATE POLICY "repay write" ON public.loan_repayments FOR ALL TO authenticated
  USING (public.can_post(auth.uid())) WITH CHECK (public.can_post(auth.uid()));

-- LEDGER
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no text NOT NULL UNIQUE DEFAULT ('TX-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  txn_date date NOT NULL DEFAULT current_date,
  category text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL DEFAULT 'cash',
  description text,
  source_table text,
  source_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_date ON public.transactions(txn_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "txn read" ON public.transactions FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR member_id = public.current_member_id());
CREATE POLICY "txn write" ON public.transactions FOR ALL TO authenticated
  USING (public.can_post(auth.uid())) WITH CHECK (public.can_post(auth.uid()));

-- SETTINGS
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin write" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- LEDGER SYNC TRIGGERS
CREATE OR REPLACE FUNCTION public.post_savings_txn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transactions (txn_date, category, direction, member_id, amount, method, description, source_table, source_id, created_by)
  VALUES (NEW.txn_date,
    CASE WHEN NEW.txn_type = 'deposit' THEN 'Savings deposit' ELSE 'Savings withdrawal' END,
    CASE WHEN NEW.txn_type = 'deposit' THEN 'in' ELSE 'out' END,
    NEW.member_id, NEW.amount, NEW.method, COALESCE(NEW.description, NEW.txn_no), 'savings_transactions', NEW.id, NEW.recorded_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_savings AFTER INSERT ON public.savings_transactions FOR EACH ROW EXECUTE FUNCTION public.post_savings_txn();

CREATE OR REPLACE FUNCTION public.post_share_txn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transactions (txn_date, category, direction, member_id, amount, method, description, source_table, source_id, created_by)
  VALUES (NEW.txn_date, 'Share purchase', 'in', NEW.member_id, ABS(NEW.shares) * NEW.price_per_share, NEW.method, NEW.txn_no, 'share_transactions', NEW.id, NEW.recorded_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_shares AFTER INSERT ON public.share_transactions FOR EACH ROW EXECUTE FUNCTION public.post_share_txn();

CREATE OR REPLACE FUNCTION public.post_repayment_txn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transactions (txn_date, category, direction, member_id, amount, method, description, source_table, source_id, created_by)
  VALUES (NEW.txn_date, 'Loan repayment', 'in', NEW.member_id, NEW.amount, NEW.method, NEW.txn_no, 'loan_repayments', NEW.id, NEW.recorded_by);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_repay AFTER INSERT ON public.loan_repayments FOR EACH ROW EXECUTE FUNCTION public.post_repayment_txn();

CREATE OR REPLACE FUNCTION public.post_disbursement_txn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'disbursed' AND (OLD.status IS DISTINCT FROM 'disbursed') THEN
    INSERT INTO public.transactions (txn_date, category, direction, member_id, amount, method, description, source_table, source_id, created_by)
    VALUES (COALESCE(NEW.disbursed_at::date, current_date), 'Loan disbursement', 'out', NEW.member_id, COALESCE(NEW.amount_approved, NEW.amount_requested), 'bank_transfer', NEW.loan_no, 'loans', NEW.id, NEW.approved_by);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_disbursement AFTER UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.post_disbursement_txn();

-- VIEWS
CREATE VIEW public.member_balances WITH (security_invoker = true) AS
SELECT m.id AS member_id,
  m.member_no, m.full_name, m.status, m.department_id,
  COALESCE(sv.deposits,0) - COALESCE(sv.withdrawals,0) AS savings_balance,
  COALESCE(sv.deposits,0) AS total_deposits,
  COALESCE(sv.withdrawals,0) AS total_withdrawals,
  COALESCE(sh.shares,0) AS shares_owned,
  COALESCE(sh.share_value,0) AS shares_value,
  COALESCE(ln.total_disbursed,0) AS total_borrowed,
  COALESCE(rp.total_repaid,0) AS total_repaid,
  GREATEST(COALESCE(ln.total_payable,0) - COALESCE(rp.total_repaid,0), 0) AS loan_balance
FROM public.members m
LEFT JOIN (
  SELECT member_id,
    SUM(amount) FILTER (WHERE txn_type='deposit') AS deposits,
    SUM(amount) FILTER (WHERE txn_type='withdrawal') AS withdrawals
  FROM public.savings_transactions GROUP BY member_id) sv ON sv.member_id = m.id
LEFT JOIN (
  SELECT member_id, SUM(shares) AS shares, SUM(shares * price_per_share) AS share_value
  FROM public.share_transactions GROUP BY member_id) sh ON sh.member_id = m.id
LEFT JOIN (
  SELECT member_id,
    SUM(COALESCE(amount_approved, amount_requested)) AS total_disbursed,
    SUM(COALESCE(amount_approved, amount_requested) * (1 + interest_rate/100 * period_months/12.0)) AS total_payable
  FROM public.loans WHERE status IN ('disbursed','completed') GROUP BY member_id) ln ON ln.member_id = m.id
LEFT JOIN (
  SELECT member_id, SUM(amount) AS total_repaid FROM public.loan_repayments GROUP BY member_id) rp ON rp.member_id = m.id;
GRANT SELECT ON public.member_balances TO authenticated;
GRANT ALL ON public.member_balances TO service_role;

-- SEED: settings, departments, products
INSERT INTO public.system_settings (key, value) VALUES
 ('sacco_name','FLOBBETO PRIMARY STAFF SAVINGS AND CREDIT COOPERATIVE LTD'),
 ('address','P.O.Box 137 Hoima City (U)'),
 ('phone','0787760259 / 0772364375'),
 ('email','info@flobbetosacco.co.ug'),
 ('currency','UGX'),
 ('share_price','10000'),
 ('min_savings','50000'),
 ('loan_to_savings_ratio','3'),
 ('financial_year','2026');

INSERT INTO public.departments (name) VALUES
 ('Administration'),('Lower Primary'),('Upper Primary'),('Support Staff'),('Finance');

INSERT INTO public.loan_products (name, max_amount, interest_rate, max_period_months, processing_fee_pct, penalty_rate, savings_multiplier) VALUES
 ('Emergency Loan', 1500000, 10, 6, 1, 2, 2),
 ('Development Loan', 8000000, 14, 24, 2, 2, 3),
 ('School Fees Loan', 3000000, 12, 12, 1.5, 2, 3),
 ('Salary Advance', 1000000, 8, 3, 1, 2, 1),
 ('Business Loan', 6000000, 15, 18, 2, 2.5, 3);

-- SEED: members
INSERT INTO public.members (member_no, full_name, staff_no, national_id, gender, date_of_birth, phone, email, address, department_id, position, join_date, status, next_of_kin, next_of_kin_phone)
SELECT v.member_no, v.full_name, v.staff_no, v.nid, v.gender, v.dob::date, v.phone, v.email, v.address, d.id, v.position, v.join_date::date, v.status::public.member_status, v.nok, v.nok_phone
FROM (VALUES
 ('FLB-001','Grace Nabbosa','ST-1001','CM90012345ABCD','Female','1985-04-12','0771000101','grace.nabbosa@flobbeto.ac.ug','Kihukya, Hoima','Administration','Head Teacher','2019-02-01','active','Peter Nabbosa','0771000102'),
 ('FLB-002','Julius Kabagambe','ST-1002','CM88012345EFGH','Male','1982-09-03','0771000103','julius.k@flobbeto.ac.ug','Kasingo, Hoima','Administration','Deputy Head Teacher','2019-02-01','active','Sarah Kabagambe','0771000104'),
 ('FLB-003','Miriam Atuhaire','ST-1003','CF91012345IJKL','Female','1991-01-22','0771000105','miriam.a@flobbeto.ac.ug','Bujumbura, Hoima','Lower Primary','Class Teacher P2','2020-01-15','active','John Atuhaire','0771000106'),
 ('FLB-004','Samuel Byaruhanga','ST-1004','CM87012345MNOP','Male','1987-06-30','0771000107','samuel.b@flobbeto.ac.ug','Kiryatete, Hoima','Upper Primary','Class Teacher P6','2019-05-10','active','Alice Byaruhanga','0771000108'),
 ('FLB-005','Esther Kyomuhendo','ST-1005','CF93012345QRST','Female','1993-11-08','0771000109','esther.k@flobbeto.ac.ug','Mparo, Hoima','Lower Primary','Class Teacher P1','2021-03-01','active','Ruth Kyomuhendo','0771000110'),
 ('FLB-006','Denis Tumusiime','ST-1006','CM89012345UVWX','Male','1989-02-17','0771000111','denis.t@flobbeto.ac.ug','Kahoora, Hoima','Finance','Bursar','2019-08-20','active','Faith Tumusiime','0771000112'),
 ('FLB-007','Patience Kemigisa','ST-1007','CF95012345YZAB','Female','1995-07-25','0771000113','patience.k@flobbeto.ac.ug','Busiisi, Hoima','Upper Primary','Class Teacher P5','2022-01-10','active','Moses Kemigisa','0771000114'),
 ('FLB-008','Robert Isingoma','ST-1008','CM84012345CDEF','Male','1984-12-01','0771000115','robert.i@flobbeto.ac.ug','Kiryatete, Hoima','Support Staff','Store Keeper','2020-09-01','active','Jane Isingoma','0771000116'),
 ('FLB-009','Sylvia Kobusingye','ST-1009','CF92012345GHIJ','Female','1992-03-14','0771000117','sylvia.k@flobbeto.ac.ug','Kibati, Hoima','Lower Primary','Class Teacher P3','2021-09-05','active','Paul Kobusingye','0771000118'),
 ('FLB-010','Andrew Mugisa','ST-1010','CM86012345KLMN','Male','1986-08-19','0771000119','andrew.m@flobbeto.ac.ug','Kisukuma, Hoima','Upper Primary','Class Teacher P7','2019-02-01','active','Diana Mugisa','0771000120'),
 ('FLB-011','Rehema Katusabe','ST-1011','CF94012345OPQR','Female','1994-05-27','0771000121','rehema.k@flobbeto.ac.ug','Kahoora, Hoima','Support Staff','Matron','2022-06-01','inactive','Ali Katusabe','0771000122'),
 ('FLB-012','Wilson Baguma','ST-1012','CM83012345STUV','Male','1983-10-05','0771000123','wilson.b@flobbeto.ac.ug','Mparo, Hoima','Administration','Director of Studies','2019-02-01','active','Betty Baguma','0771000124')
) AS v(member_no, full_name, staff_no, nid, gender, dob, phone, email, address, dept, position, join_date, status, nok, nok_phone)
LEFT JOIN public.departments d ON d.name = v.dept;

-- SEED: monthly savings for 14 months
INSERT INTO public.savings_transactions (member_id, txn_date, txn_type, category, amount, method, reference, description)
SELECT m.id,
  (date_trunc('month', current_date) - (g || ' month')::interval + interval '5 day')::date,
  'deposit', 'monthly',
  (80000 + (abs(hashtext(m.member_no || g::text)) % 9) * 10000)::numeric,
  'salary_deduction',
  'PAY-' || to_char(date_trunc('month', current_date) - (g || ' month')::interval, 'YYYYMM'),
  'Monthly payroll savings deduction'
FROM public.members m CROSS JOIN generate_series(0,13) g
WHERE m.status = 'active';

-- a few voluntary deposits and withdrawals
INSERT INTO public.savings_transactions (member_id, txn_date, txn_type, category, amount, method, reference, description)
SELECT m.id, (current_date - 40), 'deposit', 'voluntary', 250000, 'mobile_money', 'MM-88213', 'Voluntary top-up'
FROM public.members m WHERE m.member_no IN ('FLB-001','FLB-004','FLB-010');
INSERT INTO public.savings_transactions (member_id, txn_date, txn_type, category, amount, method, reference, description)
SELECT m.id, (current_date - 20), 'withdrawal', 'regular', 150000, 'cash', 'WD-1002', 'Approved savings withdrawal'
FROM public.members m WHERE m.member_no IN ('FLB-003','FLB-008');

-- SEED: shares
INSERT INTO public.share_transactions (member_id, txn_date, shares, price_per_share, method, reference)
SELECT m.id, m.join_date, (10 + (abs(hashtext(m.member_no)) % 40)), 10000, 'cash', 'SHARE-INIT'
FROM public.members m;
INSERT INTO public.share_transactions (member_id, txn_date, shares, price_per_share, method, reference)
SELECT m.id, (current_date - 90), 10, 10000, 'salary_deduction', 'SHARE-TOPUP'
FROM public.members m WHERE m.member_no IN ('FLB-002','FLB-005','FLB-012');

-- SEED: loans
INSERT INTO public.loans (member_id, product_id, amount_requested, amount_approved, purpose, period_months, interest_rate, status, applied_at, approved_at, disbursed_at)
SELECT m.id, p.id, v.req, v.appr, v.purpose, v.period, p.interest_rate, v.status::public.loan_status,
  now() - (v.days_ago || ' day')::interval,
  CASE WHEN v.status IN ('approved','disbursed','completed') THEN now() - ((v.days_ago - 5) || ' day')::interval END,
  CASE WHEN v.status IN ('disbursed','completed') THEN now() - ((v.days_ago - 7) || ' day')::interval END
FROM (VALUES
 ('FLB-001','Development Loan',5000000,4500000,'Completion of residential house',24,'disbursed',300),
 ('FLB-003','School Fees Loan',1200000,1200000,'Term two school fees for children',12,'disbursed',210),
 ('FLB-004','Emergency Loan',800000,800000,'Medical emergency',6,'completed',400),
 ('FLB-006','Business Loan',3000000,2500000,'Retail shop stock',18,'disbursed',150),
 ('FLB-007','Salary Advance',600000,600000,'Rent payment',3,'disbursed',60),
 ('FLB-010','Development Loan',4000000,NULL,'Land purchase in Kikuube',24,'pending',6),
 ('FLB-005','School Fees Loan',900000,NULL,'School fees for dependant',12,'under_review',12),
 ('FLB-009','Emergency Loan',500000,NULL,'Family funeral expenses',6,'pending',2),
 ('FLB-008','Business Loan',2000000,NULL,'Poultry project',18,'rejected',95)
) AS v(member_no, product, req, appr, purpose, period, status, days_ago)
JOIN public.members m ON m.member_no = v.member_no
JOIN public.loan_products p ON p.name = v.product;

UPDATE public.loans SET rejection_reason = 'Savings balance below the required 1:3 loan-to-savings ratio' WHERE status = 'rejected';

-- SEED: repayments for disbursed/completed loans
INSERT INTO public.loan_repayments (loan_id, member_id, txn_date, amount, principal, interest, method, reference)
SELECT l.id, l.member_id,
  (l.disbursed_at::date + (g || ' month')::interval)::date,
  round(l.amount_approved / l.period_months * (1 + l.interest_rate/100), 2),
  round(l.amount_approved / l.period_months, 2),
  round(l.amount_approved / l.period_months * (l.interest_rate/100), 2),
  'salary_deduction', 'PAYROLL'
FROM public.loans l
CROSS JOIN generate_series(1, 6) g
WHERE l.status IN ('disbursed','completed')
  AND (l.disbursed_at::date + (g || ' month')::interval)::date <= current_date;

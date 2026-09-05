CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission text NOT NULL,
  allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perms read" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "perms admin write" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

CREATE TRIGGER trg_role_permissions_updated
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.role_permissions (role, permission, allowed) VALUES
  ('admin','members.manage',true),('admin','savings.post',true),('admin','shares.post',true),
  ('admin','loans.review',true),('admin','loans.approve',true),('admin','loans.disburse',true),
  ('admin','repayments.post',true),('admin','transactions.post',true),('admin','reports.view',true),
  ('admin','reports.export',true),('admin','roles.manage',true),
  ('treasurer','members.manage',false),('treasurer','savings.post',true),('treasurer','shares.post',true),
  ('treasurer','loans.review',true),('treasurer','loans.approve',false),('treasurer','loans.disburse',true),
  ('treasurer','repayments.post',true),('treasurer','transactions.post',true),('treasurer','reports.view',true),
  ('treasurer','reports.export',true),('treasurer','roles.manage',false),
  ('committee','members.manage',false),('committee','savings.post',false),('committee','shares.post',false),
  ('committee','loans.review',true),('committee','loans.approve',true),('committee','loans.disburse',false),
  ('committee','repayments.post',false),('committee','transactions.post',false),('committee','reports.view',true),
  ('committee','reports.export',true),('committee','roles.manage',false),
  ('member','members.manage',false),('member','savings.post',false),('member','shares.post',false),
  ('member','loans.review',false),('member','loans.approve',false),('member','loans.disburse',false),
  ('member','repayments.post',false),('member','transactions.post',false),('member','reports.view',false),
  ('member','reports.export',false),('member','roles.manage',false)
ON CONFLICT (role, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission = _permission AND rp.allowed
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;

DROP POLICY IF EXISTS "savings write" ON public.savings_transactions;
CREATE POLICY "savings write" ON public.savings_transactions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'savings.post')) WITH CHECK (public.has_permission(auth.uid(),'savings.post'));

DROP POLICY IF EXISTS "shares write" ON public.share_transactions;
CREATE POLICY "shares write" ON public.share_transactions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'shares.post')) WITH CHECK (public.has_permission(auth.uid(),'shares.post'));

DROP POLICY IF EXISTS "repay write" ON public.loan_repayments;
CREATE POLICY "repay write" ON public.loan_repayments FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'repayments.post')) WITH CHECK (public.has_permission(auth.uid(),'repayments.post'));

DROP POLICY IF EXISTS "txn write" ON public.transactions;
CREATE POLICY "txn write" ON public.transactions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'transactions.post')) WITH CHECK (public.has_permission(auth.uid(),'transactions.post'));

DROP POLICY IF EXISTS "loans staff write" ON public.loans;
CREATE POLICY "loans staff write" ON public.loans FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (
    public.has_permission(auth.uid(),'loans.review')
    OR public.has_permission(auth.uid(),'loans.approve')
    OR public.has_permission(auth.uid(),'loans.disburse')
  );

DROP POLICY IF EXISTS "members write admin" ON public.members;
CREATE POLICY "members write admin" ON public.members FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'members.manage')) WITH CHECK (public.has_permission(auth.uid(),'members.manage'));
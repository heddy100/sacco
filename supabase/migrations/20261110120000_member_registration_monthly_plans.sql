CREATE TABLE public.monthly_member_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  plan_month date NOT NULL CHECK (EXTRACT(DAY FROM plan_month) = 1),
  savings_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (savings_amount >= 0),
  shares_count integer NOT NULL DEFAULT 0 CHECK (shares_count >= 0),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, plan_month),
  CHECK (savings_amount > 0 OR shares_count > 0)
);

CREATE INDEX idx_monthly_member_plans_month ON public.monthly_member_plans(plan_month);

GRANT SELECT, INSERT, UPDATE ON public.monthly_member_plans TO authenticated;
GRANT ALL ON public.monthly_member_plans TO service_role;
ALTER TABLE public.monthly_member_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly plans read own or staff" ON public.monthly_member_plans
  FOR SELECT TO authenticated
  USING (member_id = public.current_member_id() OR public.is_staff(auth.uid()));
CREATE POLICY "members submit own monthly plans" ON public.monthly_member_plans
  FOR INSERT TO authenticated
  WITH CHECK (member_id = public.current_member_id());
CREATE POLICY "members update own monthly plans" ON public.monthly_member_plans
  FOR UPDATE TO authenticated
  USING (member_id = public.current_member_id())
  WITH CHECK (member_id = public.current_member_id());

ALTER TABLE public.members
  ALTER COLUMN staff_no SET DEFAULT ('STF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

CREATE TABLE public.pending_member_registrations (
  user_id uuid PRIMARY KEY,
  details jsonb NOT NULL
);
REVOKE ALL ON public.pending_member_registrations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.pending_member_registrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.capture_member_registration_details()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF jsonb_typeof(NEW.raw_user_meta_data->'sacco_member_details') = 'object' THEN
    INSERT INTO public.pending_member_registrations (user_id, details)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->'sacco_member_details'
    );
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'sacco_member_details';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_member_registration_details
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.capture_member_registration_details();
REVOKE EXECUTE ON FUNCTION public.capture_member_registration_details() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_admin boolean;
  details jsonb;
  department uuid;
  birth_date date;
  contact_email text;
BEGIN
  SELECT registration.details INTO details
  FROM public.pending_member_registrations AS registration
  WHERE registration.user_id = NEW.id;

  contact_email := COALESCE(NEW.email, NULLIF(btrim(details->>'email'), ''));

  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), contact_email)
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles
  SET phone = COALESCE(NEW.phone, NULLIF(btrim(details->>'phone'), ''))
  WHERE id = NEW.id;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN has_admin THEN 'member'::public.app_role ELSE 'admin'::public.app_role END)
  ON CONFLICT DO NOTHING;

  IF jsonb_typeof(details) = 'object' THEN
    IF NULLIF(btrim(details->>'date_of_birth'), '') IS NOT NULL THEN
      BEGIN
        birth_date := (details->>'date_of_birth')::date;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        birth_date := NULL;
      END;
    END IF;

    SELECT id INTO department
    FROM public.departments
    WHERE lower(name) = lower(left(btrim(COALESCE(details->>'department', '')), 80))
    ORDER BY name
    LIMIT 1;

    INSERT INTO public.members (
      user_id, full_name, email, national_id, gender, date_of_birth,
      phone, address, department_id, position, next_of_kin, next_of_kin_phone
    )
    VALUES (
      NEW.id,
      left(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), 120),
      contact_email,
      NULLIF(left(btrim(COALESCE(details->>'national_id', '')), 40), ''),
      NULLIF(left(btrim(COALESCE(details->>'gender', '')), 30), ''),
      birth_date,
      NULLIF(left(btrim(COALESCE(NEW.phone, details->>'phone', '')), 20), ''),
      NULLIF(left(btrim(COALESCE(details->>'address', '')), 160), ''),
      department,
      NULLIF(left(btrim(COALESCE(details->>'position', '')), 80), ''),
      NULLIF(left(btrim(COALESCE(details->>'next_of_kin', '')), 120), ''),
      NULLIF(left(btrim(COALESCE(details->>'next_of_kin_phone', '')), 20), '')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  DELETE FROM public.pending_member_registrations WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

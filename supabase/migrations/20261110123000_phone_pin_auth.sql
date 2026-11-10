ALTER TABLE public.members
  ALTER COLUMN staff_no SET DEFAULT ('STF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));

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

ALTER TABLE public.members
  ALTER COLUMN member_no SET DEFAULT ('MBR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  ALTER COLUMN staff_no SET DEFAULT ('STF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
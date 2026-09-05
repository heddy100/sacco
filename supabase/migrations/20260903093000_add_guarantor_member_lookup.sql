CREATE OR REPLACE FUNCTION public.get_guarantor_members()
RETURNS TABLE (
  id uuid,
  member_no text,
  full_name text,
  phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.member_no, m.full_name, m.phone
  FROM public.members AS m
  WHERE m.status = 'active'
  ORDER BY m.member_no;
$$;

REVOKE ALL ON FUNCTION public.get_guarantor_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guarantor_members() TO authenticated;
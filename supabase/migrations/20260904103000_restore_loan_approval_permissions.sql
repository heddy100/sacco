GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

INSERT INTO public.role_permissions (role, permission, allowed) VALUES
  ('admin', 'loans.review', true),
  ('admin', 'loans.approve', true),
  ('admin', 'loans.disburse', true),
  ('committee', 'loans.review', true),
  ('committee', 'loans.approve', true),
  ('treasurer', 'loans.review', true),
  ('treasurer', 'loans.disburse', true)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;
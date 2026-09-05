-- 1. Storage: restrict member photo reads to staff or the owning member
DROP POLICY IF EXISTS "member photos read" ON storage.objects;
CREATE POLICY "member photos read staff or own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'member-photos'
  AND (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid()
        AND (storage.foldername(name))[1] = m.id::text
    )
  )
);

-- 2. Revoke direct API execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.can_post(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_member_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_disbursement_txn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_repayment_txn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_savings_txn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.post_share_txn() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_post(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_member_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_disbursement_txn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_repayment_txn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_savings_txn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_share_txn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
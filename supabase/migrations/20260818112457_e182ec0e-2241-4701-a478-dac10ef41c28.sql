REVOKE EXECUTE ON FUNCTION public.post_savings_txn() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.post_share_txn() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.post_repayment_txn() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.post_disbursement_txn() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;
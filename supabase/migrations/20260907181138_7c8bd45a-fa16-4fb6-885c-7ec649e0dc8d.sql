REVOKE ALL ON FUNCTION public.erp_scope_lease_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_scope_lease_config() TO service_role;

DROP POLICY IF EXISTS "Profiles are viewable by all authenticated users" ON public.profiles;

CREATE POLICY "profiles select self or admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_permission(auth.uid(), 'user.create')
  OR public.user_has_permission(auth.uid(), 'user.suspend')
);

CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT user_id, display_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;

REVOKE SELECT (phone, real_name) ON public.profiles FROM anon;

REVOKE SELECT (worker_account_key) ON public.social_accounts FROM authenticated, anon;
GRANT SELECT (
  id, shop_id, platform, account_name, avatar_url, cookie_status,
  last_check_at, meta, created_by, created_at, updated_at,
  worker_account_id, content_kinds, capabilities
) ON public.social_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.app_role_permissions arp
      ON arp.role_code = COALESCE(ur.role_code, 'staff')
    WHERE ur.user_id = _user_id
      AND arp.permission_key = _perm
      AND COALESCE(ur.suspended, false) = false
  );
$$;

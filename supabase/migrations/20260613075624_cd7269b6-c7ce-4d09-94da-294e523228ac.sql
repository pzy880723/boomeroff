
-- 1) user_roles: prevent privilege escalation on INSERT
CREATE OR REPLACE FUNCTION public.can_assign_role_code(_actor uuid, _target_role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH actor_min AS (
    SELECT MIN(r.sort_order) AS so
    FROM public.user_roles ur
    JOIN public.app_roles r ON r.code = ur.role_code
    WHERE ur.user_id = _actor AND COALESCE(ur.suspended, false) = false
  ),
  target AS (
    SELECT sort_order AS so FROM public.app_roles WHERE code = _target_role_code
  )
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _actor AND ur.role_code = 'super_admin' AND COALESCE(ur.suspended,false)=false)
    OR (
      (SELECT so FROM target) IS NOT NULL
      AND (SELECT so FROM actor_min) IS NOT NULL
      AND (SELECT so FROM target) > (SELECT so FROM actor_min)
    );
$$;

DROP POLICY IF EXISTS "roles insert by perm" ON public.user_roles;
CREATE POLICY "roles insert by perm"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_has_permission(auth.uid(), 'user.create')
  AND role_code IS NOT NULL
  AND public.can_assign_role_code(auth.uid(), role_code)
);

DROP POLICY IF EXISTS "roles update by perm" ON public.user_roles;
CREATE POLICY "roles update by perm"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  user_has_permission(auth.uid(), 'user.update_role')
  OR user_has_permission(auth.uid(), 'user.suspend')
)
WITH CHECK (
  (
    user_has_permission(auth.uid(), 'user.update_role')
    AND role_code IS NOT NULL
    AND public.can_assign_role_code(auth.uid(), role_code)
  )
  OR user_has_permission(auth.uid(), 'user.suspend')
);

-- 2) vouchers: drop creator-read PII leak; consolidate under voucher.manage
DROP POLICY IF EXISTS "vouchers creator read" ON public.vouchers;
CREATE POLICY "vouchers manager read"
ON public.vouchers
FOR SELECT
TO authenticated
USING (user_has_permission(auth.uid(), 'voucher.manage'));

-- 3) guest_daily_usage: explicit restrictive deny for client roles
CREATE POLICY "deny client access"
ON public.guest_daily_usage
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 4) realtime.messages: drop overly broad policy (app does not use broadcast/presence)
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;

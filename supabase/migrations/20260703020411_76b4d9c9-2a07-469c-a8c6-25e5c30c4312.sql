CREATE OR REPLACE FUNCTION public.current_user_shop_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.shop_id
  FROM public.staff_profiles sp
  WHERE sp.user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_user_shop_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_shop_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_shop_id() TO service_role;

DROP POLICY IF EXISTS "staff read self or same shop manager" ON public.staff_profiles;
DROP POLICY IF EXISTS "staff read self or has perm" ON public.staff_profiles;
DROP POLICY IF EXISTS "staff read self or admin" ON public.staff_profiles;

CREATE POLICY "staff read self admin or same shop staff reader"
ON public.staff_profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.user_has_permission(auth.uid(), 'staff.read'::text)
    AND shop_id IS NOT NULL
    AND shop_id = public.current_user_shop_id()
  )
);

CREATE OR REPLACE FUNCTION public.admin_list_user_emails(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.user_has_permission(auth.uid(), 'user.create') OR public.user_has_permission(auth.uid(), 'user.suspend')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.id = ANY(_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_user_emails(uuid[]) TO authenticated;

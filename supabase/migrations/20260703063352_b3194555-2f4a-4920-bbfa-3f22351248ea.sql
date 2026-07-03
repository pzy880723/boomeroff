
REVOKE SELECT ON public.social_accounts FROM authenticated;
GRANT SELECT (
  id, shop_id, platform, account_name, avatar_url,
  cookie_status, last_check_at, meta,
  worker_account_id, content_kinds, capabilities,
  created_by, created_at, updated_at
) ON public.social_accounts TO authenticated;

DROP POLICY IF EXISTS "kb_documents staff read by shop" ON public.kb_documents;
CREATE POLICY "kb_documents staff read by shop"
ON public.kb_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.suspended, false) = false
      AND ur.role_code IS NOT NULL
  )
  AND (
    kb_documents.shop_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.shop_id = kb_documents.shop_id
    )
  )
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND COALESCE(ur.suspended, false) = false
      AND (
        CASE
          WHEN ur.role_code IN ('super_admin','area_manager','shop_manager') THEN 'admin'::app_role
          WHEN ur.role_code IS NOT NULL THEN 'anchor'::app_role
          ELSE ur.role
        END
      ) = _role
  )
$$;

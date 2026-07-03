
-- 1) invitations: 强制 created_by = auth.uid()
DROP POLICY IF EXISTS "invitations insert by perm" ON public.invitations;
CREATE POLICY "invitations insert by perm"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_permission(auth.uid(), 'user.create')
  AND created_by = auth.uid()
);

-- 2) kb_documents: 全局文档也要求当前用户是"未停用"的员工
DROP POLICY IF EXISTS "kb_documents staff read by shop" ON public.kb_documents;
CREATE POLICY "kb_documents staff read by shop"
ON public.kb_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND COALESCE(ur.suspended, false) = false
  )
  AND (
    shop_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.shop_id = kb_documents.shop_id
    )
  )
);

-- 3) social_accounts: 撤销 worker_account_key 列的读取权限
REVOKE SELECT (worker_account_key) ON public.social_accounts FROM authenticated;
REVOKE SELECT (worker_account_key) ON public.social_accounts FROM anon;

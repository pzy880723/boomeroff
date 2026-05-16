-- 1) 新增权限 key: history.read_all
INSERT INTO public.app_permissions (key, name, description, "group", sort_order)
VALUES ('history.read_all', '查看全部识别历史', '允许查看所有店员的识别记录', 'history', 100)
ON CONFLICT (key) DO NOTHING;

-- 2) 给 super_admin 角色绑定该权限（若角色存在）
INSERT INTO public.app_role_permissions (role_code, permission_key)
SELECT 'super_admin', 'history.read_all'
WHERE EXISTS (SELECT 1 FROM public.app_roles WHERE code = 'super_admin')
ON CONFLICT DO NOTHING;

-- 3) 替换 products 的 SELECT 策略：仅自己创建的 + 有 history.read_all 权限的可看全部
DROP POLICY IF EXISTS "Products viewable by all authenticated users" ON public.products;

CREATE POLICY "products select own or admin"
ON public.products FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.user_has_permission(auth.uid(), 'history.read_all')
);
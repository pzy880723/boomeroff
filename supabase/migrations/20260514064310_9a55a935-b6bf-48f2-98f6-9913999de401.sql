
-- 1. 角色定义表
CREATE TABLE public.app_roles (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

-- 2. 权限点定义表
CREATE TABLE public.app_permissions (
  key text PRIMARY KEY,
  name text NOT NULL,
  "group" text NOT NULL DEFAULT 'general',
  description text,
  sort_order int NOT NULL DEFAULT 0
);
ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY;

-- 3. 角色-权限映射
CREATE TABLE public.app_role_permissions (
  role_code text NOT NULL REFERENCES public.app_roles(code) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.app_permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_key)
);
ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;

-- 4. user_roles 增加 role_code / area_code
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS role_code text,
  ADD COLUMN IF NOT EXISTS area_code text;

-- 5. Seed: 角色
INSERT INTO public.app_roles (code, name, description, is_system, sort_order) VALUES
  ('super_admin', '超级管理员', '拥有全部权限：角色与权限管理、账号审批、AI/知识库后台等。', true, 1),
  ('area_manager', '区域经理', '可跨门店查看数据/排班/库存，管理本区门店店员，但不可改全局设置。', true, 2),
  ('shop_manager', '店长', '单门店全部业务权限：排班、知识库、社区审核、识别历史、价格、员工档案。', true, 3),
  ('staff', '正式店员', '识别、上传、写社区，查看本店知识库与排班。', true, 4),
  ('parttime', '兼职店员', '识别、查看本店排班和知识库；不能改价格、不能加入官方知识库。', true, 5),
  ('intern', '实习生', '仅可识别 + 查看知识库 + 查看自己的排班。', true, 6);

-- 6. Seed: 权限点
INSERT INTO public.app_permissions (key, name, "group", description, sort_order) VALUES
  ('recognition.use', '使用 AI 识别', '识别', '在 AI 识别页拍照识别商品。', 10),
  ('product.create', '新增商品入库', '商品', '识别后写入 products 表。', 20),
  ('product.edit', '编辑商品', '商品', '修改商品资料。', 21),
  ('product.delete', '删除商品', '商品', '删除商品记录。', 22),
  ('price.write', '记录/修改价格', '商品', '写入或修改价格记录。', 23),
  ('community.post', '发中古圈帖子', '社区', '发布作品到中古圈。', 30),
  ('community.moderate', '社区审核', '社区', '隐藏/删除他人帖子与评论。', 31),
  ('knowledge.personal.write', '写个人知识库', '知识库', '新增/编辑个人知识。', 40),
  ('knowledge.official.write', '写官方知识库', '知识库', '新增/编辑/删除官方知识。', 41),
  ('schedule.view_self', '查看自己的排班', '排班', '查看 Me 页自己的排班。', 50),
  ('schedule.view_shop', '查看本店排班', '排班', '查看本店所有人的排班。', 51),
  ('schedule.manage', '管理排班', '排班', '生成/调整本店排班，设置班次与节假日。', 52),
  ('shop.kb.read', '查看门店 SOP / 顾客 Q&A', '门店', '阅读门店知识库。', 60),
  ('shop.kb.write', '编辑门店 SOP / 顾客 Q&A', '门店', '维护门店知识库。', 61),
  ('staff.manage', '管理员工档案与账号', '人员', '账号审批、员工档案、密码重置。', 70),
  ('role.manage', '管理角色与权限', '系统', '增删角色、调整权限矩阵。', 80),
  ('settings.ai', '管理 AI 与系统设置', '系统', 'AI 模型、联网搜索、闲鱼缓存等后台设置。', 81);

-- 7. Seed: 角色 ↔ 权限矩阵
-- super_admin: 所有权限
INSERT INTO public.app_role_permissions (role_code, permission_key)
SELECT 'super_admin', key FROM public.app_permissions;

-- area_manager
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('area_manager', 'recognition.use'),
  ('area_manager', 'product.create'),
  ('area_manager', 'product.edit'),
  ('area_manager', 'community.post'),
  ('area_manager', 'community.moderate'),
  ('area_manager', 'knowledge.personal.write'),
  ('area_manager', 'schedule.view_self'),
  ('area_manager', 'schedule.view_shop'),
  ('area_manager', 'schedule.manage'),
  ('area_manager', 'shop.kb.read'),
  ('area_manager', 'shop.kb.write'),
  ('area_manager', 'staff.manage');

-- shop_manager
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('shop_manager', 'recognition.use'),
  ('shop_manager', 'product.create'),
  ('shop_manager', 'product.edit'),
  ('shop_manager', 'product.delete'),
  ('shop_manager', 'price.write'),
  ('shop_manager', 'community.post'),
  ('shop_manager', 'community.moderate'),
  ('shop_manager', 'knowledge.personal.write'),
  ('shop_manager', 'schedule.view_self'),
  ('shop_manager', 'schedule.view_shop'),
  ('shop_manager', 'schedule.manage'),
  ('shop_manager', 'shop.kb.read'),
  ('shop_manager', 'shop.kb.write'),
  ('shop_manager', 'staff.manage');

-- staff
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('staff', 'recognition.use'),
  ('staff', 'product.create'),
  ('staff', 'price.write'),
  ('staff', 'community.post'),
  ('staff', 'knowledge.personal.write'),
  ('staff', 'schedule.view_self'),
  ('staff', 'schedule.view_shop'),
  ('staff', 'shop.kb.read');

-- parttime
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('parttime', 'recognition.use'),
  ('parttime', 'product.create'),
  ('parttime', 'community.post'),
  ('parttime', 'schedule.view_self'),
  ('parttime', 'schedule.view_shop'),
  ('parttime', 'shop.kb.read');

-- intern
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('intern', 'recognition.use'),
  ('intern', 'schedule.view_self'),
  ('intern', 'shop.kb.read');

-- 8. 把现有 user_roles 的 role enum 同步到 role_code
UPDATE public.user_roles
   SET role_code = CASE
     WHEN role::text = 'admin' THEN 'super_admin'
     WHEN role::text = 'anchor' THEN 'staff'
     ELSE 'staff'
   END
 WHERE role_code IS NULL;

-- 9. 权限校验函数
CREATE OR REPLACE FUNCTION public.user_has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.app_role_permissions arp
      ON arp.role_code = COALESCE(ur.role_code,
            CASE WHEN ur.role::text = 'admin' THEN 'super_admin' ELSE 'staff' END)
    WHERE ur.user_id = _user_id
      AND arp.permission_key = _perm
      AND COALESCE(ur.suspended, false) = false
  );
$$;

-- 10. RLS 策略
-- app_roles: 全员可读，role.manage 可写
CREATE POLICY "roles read" ON public.app_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles write" ON public.app_roles
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'role.manage'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'role.manage'));

-- app_permissions: 全员可读，role.manage 可写（一般不增删，只让 super 改）
CREATE POLICY "perms read" ON public.app_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "perms write" ON public.app_permissions
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'role.manage'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'role.manage'));

-- app_role_permissions: 全员可读，role.manage 可写
CREATE POLICY "role_perms read" ON public.app_role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_perms write" ON public.app_role_permissions
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'role.manage'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'role.manage'));

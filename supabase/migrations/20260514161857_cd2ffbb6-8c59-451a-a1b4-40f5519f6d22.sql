
-- ============================================================
-- 1. 重建权限清单
-- ============================================================
-- 先清空角色-权限映射（稍后按新矩阵重灌）
TRUNCATE public.app_role_permissions;

-- 删除旧权限
DELETE FROM public.app_permissions;

-- 插入新权限清单
INSERT INTO public.app_permissions (key, name, description, "group", sort_order) VALUES
  -- 人员
  ('user.read',           '查看用户列表',     '查看 Portal 用户列表',                 '人员', 10),
  ('user.create',         '新建用户',         '直接创建用户账号',                       '人员', 11),
  ('user.update_role',    '修改用户角色',     '为用户分配/变更角色',                     '人员', 12),
  ('user.suspend',        '停用/启用用户',    '审批待审核用户、停用账号',                 '人员', 13),
  ('user.reset_password', '重置用户密码',     '为他人重置登录密码',                       '人员', 14),
  ('staff.read',          '查看员工档案',     '查看其他员工的资料、排班属性、禁排日',     '人员', 15),
  ('staff.write',         '编辑员工档案',     '修改员工真实姓名、门店、排班属性等',       '人员', 16),
  -- 门店
  ('shop.read',           '查看门店列表',     '查看所有门店',                             '门店', 20),
  ('shop.write',          '管理门店',         '新增/编辑/停用门店',                       '门店', 21),
  -- 排班
  ('schedule.view_self',  '查看自己排班',     '在「我的」里看到自己的排班',               '排班', 30),
  ('schedule.view_shop',  '查看本店排班',     '查看本店全员排班',                         '排班', 31),
  ('schedule.write',      '手动排班',         '在排班表里手动添加/删除班次',             '排班', 32),
  ('schedule.ai',         'AI 智能排班',      '使用 AI 一键生成本周排班',                 '排班', 33),
  ('schedule.clear',      '清空排班',         '清空一周/一店的排班',                     '排班', 34),
  ('shift.write',         '管理班次',         '管理早/中/晚等班次定义',                   '排班', 35),
  ('holiday.write',       '管理节假日',       '维护门店节假日',                           '排班', 36),
  ('dayoff.write',        '管理员工禁排日',   '为员工添加请假/禁排日期',                 '排班', 37),
  -- 知识库
  ('shop.kb.read',        '查看门店 SOP/Q&A','查看门店 SOP 和顾客 Q&A',                  '知识库', 40),
  ('shop.kb.write',       '编辑门店 SOP/Q&A','新增、修改、删除 SOP / Q&A 词条',          '知识库', 41),
  ('shop.kb.category',    '管理 SOP/Q&A 分类','管理 SOP/Q&A 的分类',                    '知识库', 42),
  ('knowledge.official.read',  '查看官方知识', '查看官方知识库',                          '知识库', 43),
  ('knowledge.official.write', '编辑官方知识', '新增、修改、删除官方知识库条目',          '知识库', 44),
  ('knowledge.personal.write', '写个人知识库', '维护自己的个人知识库',                    '知识库', 45),
  -- 识别 / 商品
  ('recognition.use',     '使用 AI 识别',     '使用拍照识别功能',                         '识别', 50),
  ('product.create',      '新增商品入库',     '识别后入库新商品',                         '识别', 51),
  ('product.edit',        '编辑商品',         '编辑商品资料',                             '识别', 52),
  ('product.delete',      '删除商品',         '删除商品记录',                             '识别', 53),
  ('price.write',         '记录/修改价格',    '为商品记录/修改成本价、售价等',           '识别', 54),
  -- 社区
  ('community.post',      '发中古圈帖子',     '在中古圈发布动态',                         '社区', 60),
  ('community.moderate',  '社区审核',         '删除/审核他人帖子和评论',                 '社区', 61),
  -- 系统
  ('settings.ai',          'AI 模型设置',      '更换 AI 模型、提示词等',                  '系统', 70),
  ('settings.recognition', '识别管线设置',     '联网搜索开关、识别管线配置',              '系统', 71),
  ('xianyu.manage',        '闲鱼行情管理',     '抓取和管理闲鱼缓存',                       '系统', 72),
  ('correction.review',    '纠错审核',         '审核店员提交的识别纠错',                   '系统', 73),
  ('role.manage',          '管理角色与权限',   '新建角色、分配权限',                       '系统', 74);

-- ============================================================
-- 2. 默认角色权限矩阵
-- ============================================================
-- super_admin：全部
INSERT INTO public.app_role_permissions (role_code, permission_key)
SELECT 'super_admin', key FROM public.app_permissions;

-- area_manager：除少数顶级权限外都有
INSERT INTO public.app_role_permissions (role_code, permission_key)
SELECT 'area_manager', key FROM public.app_permissions
WHERE key NOT IN ('role.manage','settings.ai','settings.recognition','xianyu.manage','user.update_role');

-- shop_manager：本店运营
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('shop_manager','user.read'),
  ('shop_manager','staff.read'), ('shop_manager','staff.write'),
  ('shop_manager','shop.read'),
  ('shop_manager','schedule.view_self'), ('shop_manager','schedule.view_shop'),
  ('shop_manager','schedule.write'), ('shop_manager','schedule.ai'), ('shop_manager','schedule.clear'),
  ('shop_manager','shift.write'), ('shop_manager','holiday.write'), ('shop_manager','dayoff.write'),
  ('shop_manager','shop.kb.read'), ('shop_manager','shop.kb.write'), ('shop_manager','shop.kb.category'),
  ('shop_manager','knowledge.official.read'),
  ('shop_manager','knowledge.personal.write'),
  ('shop_manager','recognition.use'),
  ('shop_manager','product.create'), ('shop_manager','product.edit'), ('shop_manager','price.write'),
  ('shop_manager','community.post'), ('shop_manager','community.moderate'),
  ('shop_manager','correction.review');

-- staff（正式店员）
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('staff','recognition.use'),
  ('staff','product.create'), ('staff','product.edit'),
  ('staff','price.write'),
  ('staff','schedule.view_self'), ('staff','schedule.view_shop'),
  ('staff','shop.kb.read'),
  ('staff','knowledge.official.read'),
  ('staff','knowledge.personal.write'),
  ('staff','community.post');

-- parttime（兼职）
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('parttime','recognition.use'),
  ('parttime','schedule.view_self'),
  ('parttime','shop.kb.read'),
  ('parttime','knowledge.official.read');

-- intern（实习）
INSERT INTO public.app_role_permissions (role_code, permission_key) VALUES
  ('intern','recognition.use'),
  ('intern','schedule.view_self'),
  ('intern','shop.kb.read'),
  ('intern','knowledge.official.read');

-- ============================================================
-- 3. 替换 RLS 策略：基于 user_has_permission()
-- ============================================================
-- staff_profiles
DROP POLICY IF EXISTS "staff admin write" ON public.staff_profiles;
DROP POLICY IF EXISTS "staff read self or admin" ON public.staff_profiles;
CREATE POLICY "staff read self or has perm" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.user_has_permission(auth.uid(), 'staff.read'));
CREATE POLICY "staff write by perm" ON public.staff_profiles
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'staff.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'staff.write'));

-- staff_day_offs
DROP POLICY IF EXISTS "day_offs admin write" ON public.staff_day_offs;
DROP POLICY IF EXISTS "day_offs read self or admin" ON public.staff_day_offs;
CREATE POLICY "day_offs read self or has perm" ON public.staff_day_offs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.user_has_permission(auth.uid(), 'staff.read'));
CREATE POLICY "day_offs write by perm" ON public.staff_day_offs
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'dayoff.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'dayoff.write'));

-- shift_schedules
DROP POLICY IF EXISTS "schedules admin write" ON public.shift_schedules;
CREATE POLICY "schedules write by perm" ON public.shift_schedules
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'schedule.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'schedule.write'));

-- shop_shifts
DROP POLICY IF EXISTS "shifts admin write" ON public.shop_shifts;
CREATE POLICY "shifts write by perm" ON public.shop_shifts
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'shift.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'shift.write'));

-- shop_holidays
DROP POLICY IF EXISTS "holidays admin write" ON public.shop_holidays;
CREATE POLICY "holidays write by perm" ON public.shop_holidays
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'holiday.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'holiday.write'));

-- shops
DROP POLICY IF EXISTS "shops admin write" ON public.shops;
CREATE POLICY "shops write by perm" ON public.shops
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'shop.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'shop.write'));

-- shop_kb_categories
DROP POLICY IF EXISTS "kb cats admin write" ON public.shop_kb_categories;
CREATE POLICY "kb cats write by perm" ON public.shop_kb_categories
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'shop.kb.category'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'shop.kb.category'));

-- shop_kb_entries
DROP POLICY IF EXISTS "kb entries admin write" ON public.shop_kb_entries;
CREATE POLICY "kb entries write by perm" ON public.shop_kb_entries
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'shop.kb.write'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'shop.kb.write'));

-- official_knowledge
DROP POLICY IF EXISTS "Only admins delete official knowledge" ON public.official_knowledge;
DROP POLICY IF EXISTS "Only admins insert official knowledge" ON public.official_knowledge;
DROP POLICY IF EXISTS "Only admins update official knowledge" ON public.official_knowledge;
CREATE POLICY "official kb write by perm" ON public.official_knowledge
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(auth.uid(), 'knowledge.official.write'));
CREATE POLICY "official kb update by perm" ON public.official_knowledge
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'knowledge.official.write'));
CREATE POLICY "official kb delete by perm" ON public.official_knowledge
  FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'knowledge.official.write'));

-- app_settings
DROP POLICY IF EXISTS "Only admins can delete settings" ON public.app_settings;
DROP POLICY IF EXISTS "Only admins can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Only admins can update settings" ON public.app_settings;
CREATE POLICY "settings write by perm" ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(auth.uid(), 'settings.ai')
    OR public.user_has_permission(auth.uid(), 'settings.recognition')
    OR public.user_has_permission(auth.uid(), 'correction.review')
  );
CREATE POLICY "settings update by perm" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'settings.ai')
    OR public.user_has_permission(auth.uid(), 'settings.recognition')
    OR public.user_has_permission(auth.uid(), 'correction.review')
  );
CREATE POLICY "settings delete by perm" ON public.app_settings
  FOR DELETE TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'settings.ai')
    OR public.user_has_permission(auth.uid(), 'settings.recognition')
  );

-- community_posts (delete only — keep insert/update/select unchanged)
DROP POLICY IF EXISTS "Users or admins delete posts" ON public.community_posts;
CREATE POLICY "delete own or moderate" ON public.community_posts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_permission(auth.uid(), 'community.moderate'));

-- community_comments (delete moderation)
DROP POLICY IF EXISTS "Users or admins delete comments" ON public.community_comments;
CREATE POLICY "delete own comment or moderate" ON public.community_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.user_has_permission(auth.uid(), 'community.moderate'));

-- xianyu_price_snapshots delete
DROP POLICY IF EXISTS "Admins delete snapshots" ON public.xianyu_price_snapshots;
CREATE POLICY "snapshots delete by perm" ON public.xianyu_price_snapshots
  FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'xianyu.manage'));

-- invitations
DROP POLICY IF EXISTS "Admins can manage invitations" ON public.invitations;
CREATE POLICY "invitations manage by perm" ON public.invitations
  FOR ALL TO authenticated
  USING (public.user_has_permission(auth.uid(), 'user.create'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'user.create'));

-- user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "roles view by perm" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'user.read'));
CREATE POLICY "roles insert by perm" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(auth.uid(), 'user.create'));
CREATE POLICY "roles update by perm" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'user.update_role')
    OR public.user_has_permission(auth.uid(), 'user.suspend')
  );
CREATE POLICY "roles delete by perm" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'user.create'));

-- price_records
DROP POLICY IF EXISTS "Admins can delete price records" ON public.price_records;
DROP POLICY IF EXISTS "Only admins can update price records" ON public.price_records;
CREATE POLICY "price delete by perm" ON public.price_records
  FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'price.write'));
CREATE POLICY "price update by perm" ON public.price_records
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'price.write'));

-- products
DROP POLICY IF EXISTS "Only admins can delete products" ON public.products;
DROP POLICY IF EXISTS "Only admins can update products" ON public.products;
CREATE POLICY "products delete by perm" ON public.products
  FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'product.delete'));
CREATE POLICY "products update by perm" ON public.products
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'product.edit'));

-- product_knowledge
DROP POLICY IF EXISTS "Only admins can delete knowledge" ON public.product_knowledge;
DROP POLICY IF EXISTS "Only admins can update knowledge" ON public.product_knowledge;
CREATE POLICY "pk delete by perm" ON public.product_knowledge
  FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'knowledge.official.write'));
CREATE POLICY "pk update by perm" ON public.product_knowledge
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'knowledge.official.write'));

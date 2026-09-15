-- 1) 写入权威兜底：停用 / 已治理但授权无效（撤销、未配置、停用）一律阻断
CREATE OR REPLACE FUNCTION public.write_authority_blocked()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT auth.uid() IS NULL
      OR public.account_suspended()
      OR (
        (
          public.erp_is_governed()
          OR EXISTS (SELECT 1 FROM public.erp_user_links l WHERE l.aigc_user_id = auth.uid())
        )
        AND NOT public.erp_scope_active()
      )
$$;

REVOKE ALL ON FUNCTION public.write_authority_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_authority_blocked() TO authenticated, service_role;

-- 2) 全局/旧管理员写分支改为权威判定（ERP 治理账号只认 ERP 动作权限）
DROP POLICY IF EXISTS "official kb write by perm" ON public.official_knowledge;
DROP POLICY IF EXISTS "official kb update by perm" ON public.official_knowledge;
DROP POLICY IF EXISTS "official kb delete by perm" ON public.official_knowledge;
CREATE POLICY "official kb write by perm" ON public.official_knowledge
  FOR INSERT WITH CHECK (public.can_write_scoped(NULL, 'knowledge.official.write'));
CREATE POLICY "official kb update by perm" ON public.official_knowledge
  FOR UPDATE USING (public.can_write_scoped(NULL, 'knowledge.official.write'))
  WITH CHECK (public.can_write_scoped(NULL, 'knowledge.official.write'));
CREATE POLICY "official kb delete by perm" ON public.official_knowledge
  FOR DELETE USING (public.can_write_scoped(NULL, 'knowledge.official.write'));

DROP POLICY IF EXISTS "Anchors and admins can create knowledge" ON public.product_knowledge;
DROP POLICY IF EXISTS "pk update by perm" ON public.product_knowledge;
DROP POLICY IF EXISTS "pk delete by perm" ON public.product_knowledge;
CREATE POLICY "pk insert by perm" ON public.product_knowledge
  FOR INSERT WITH CHECK (
    public.can_write_scoped(NULL, 'knowledge.personal.write')
    OR public.can_write_scoped(NULL, 'knowledge.official.write')
  );
CREATE POLICY "pk update by perm" ON public.product_knowledge
  FOR UPDATE USING (public.can_write_scoped(NULL, 'knowledge.official.write'))
  WITH CHECK (public.can_write_scoped(NULL, 'knowledge.official.write'));
CREATE POLICY "pk delete by perm" ON public.product_knowledge
  FOR DELETE USING (public.can_write_scoped(NULL, 'knowledge.official.write'));

DROP POLICY IF EXISTS "settings write by perm" ON public.app_settings;
DROP POLICY IF EXISTS "settings update by perm" ON public.app_settings;
DROP POLICY IF EXISTS "settings delete by perm" ON public.app_settings;
CREATE POLICY "settings write by perm" ON public.app_settings
  FOR INSERT WITH CHECK (
    public.can_write_scoped(NULL, 'settings.ai')
    OR public.can_write_scoped(NULL, 'settings.recognition')
    OR public.can_write_scoped(NULL, 'correction.review')
  );
CREATE POLICY "settings update by perm" ON public.app_settings
  FOR UPDATE USING (
    public.can_write_scoped(NULL, 'settings.ai')
    OR public.can_write_scoped(NULL, 'settings.recognition')
    OR public.can_write_scoped(NULL, 'correction.review')
  );
CREATE POLICY "settings delete by perm" ON public.app_settings
  FOR DELETE USING (
    public.can_write_scoped(NULL, 'settings.ai')
    OR public.can_write_scoped(NULL, 'settings.recognition')
  );

DROP POLICY IF EXISTS "shop marketing profiles insert by store" ON public.shop_marketing_profiles;
DROP POLICY IF EXISTS "shop marketing profiles update by store" ON public.shop_marketing_profiles;
DROP POLICY IF EXISTS "shop marketing profiles delete by store" ON public.shop_marketing_profiles;
CREATE POLICY "shop marketing profiles insert by store" ON public.shop_marketing_profiles
  FOR INSERT WITH CHECK (public.can_write_scoped(shop_id, 'shop.write'));
CREATE POLICY "shop marketing profiles update by store" ON public.shop_marketing_profiles
  FOR UPDATE USING (public.can_write_scoped(shop_id, 'shop.write'))
  WITH CHECK (public.can_write_scoped(shop_id, 'shop.write'));
CREATE POLICY "shop marketing profiles delete by store" ON public.shop_marketing_profiles
  FOR DELETE USING (public.can_write_scoped(shop_id, 'shop.write'));

-- 3) restrictive 兜底：停用 / 撤销 / 授权无效时阻断运营写入
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'official_knowledge','product_knowledge','app_settings','shop_marketing_profiles',
    'shop_shifts','shop_holidays','shift_schedules','staff_day_offs',
    'operation_okrs','shop_kb_entries','shop_kb_categories'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'write guard authority insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'write guard authority update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'write guard authority delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.write_authority_blocked())', 'write guard authority insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.write_authority_blocked())', 'write guard authority update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.write_authority_blocked())', 'write guard authority delete', t);
  END LOOP;
END $$;
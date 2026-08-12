import {
  createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { readUserCache, writeUserCache } from '@/lib/appCache';

export type PermissionKey =
  // 人员
  | 'user.read' | 'user.create' | 'user.update_role' | 'user.suspend' | 'user.reset_password'
  | 'staff.read' | 'staff.write'
  // 门店
  | 'shop.read' | 'shop.write'
  // 排班
  | 'schedule.view_self' | 'schedule.view_shop'
  | 'schedule.write' | 'schedule.ai' | 'schedule.clear'
  | 'shift.write' | 'holiday.write' | 'dayoff.write'
  // 知识库
  | 'shop.kb.read' | 'shop.kb.write' | 'shop.kb.category'
  | 'knowledge.official.read' | 'knowledge.official.write'
  | 'knowledge.personal.write'
  // 识别 / 商品
  | 'recognition.use'
  | 'product.create' | 'product.edit' | 'product.delete'
  | 'price.write'
  // 社区
  | 'community.post' | 'community.moderate'
  // 系统
  | 'settings.ai' | 'settings.recognition'
  | 'correction.review'
  | 'history.read_all'
  | 'role.manage'
  // 优惠券
  | 'voucher.manage' | 'voucher.redeem';

interface Ctx {
  loading: boolean;
  roleCode: string | null;
  permissions: Set<string>;
  can: (perm: PermissionKey | string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<Ctx | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const {
    user,
    roleCode: authRoleCode,
    bootstrap,
    bootstrapLoading,
    refreshBootstrap,
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) {
      setRoleCode(null);
      setPerms(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const code = authRoleCode ?? 'staff';
      setRoleCode(code);

      const { data: rp } = await supabase
        .from('app_role_permissions')
        .select('permission_key')
        .eq('role_code', code);

      const keys = (rp || []).map((r: any) => r.permission_key as string);
      setPerms(new Set(keys));
      writeUserCache('permissions', user.id, { roleCode: code, permissions: keys });
    } catch (e) {
      console.error('[Permissions] load error', e);
      setPerms(new Set());
    } finally {
      setLoading(false);
    }
  }, [user, authRoleCode]);

  useEffect(() => {
    if (!user) {
      setRoleCode(null);
      setPerms(new Set());
      setLoading(false);
      return;
    }

    if (bootstrap) {
      const code = bootstrap.user_role?.role_code ?? authRoleCode ?? 'staff';
      setRoleCode(code);
      setPerms(new Set(bootstrap.permissions));
      setLoading(false);
      writeUserCache('permissions', user.id, { roleCode: code, permissions: bootstrap.permissions });
      return;
    }

    const cached = readUserCache<{ roleCode: string; permissions: string[] }>('permissions', user.id);
    if (cached) {
      setRoleCode(cached.roleCode);
      setPerms(new Set(cached.permissions));
      setLoading(false);
    }

    if (bootstrapLoading) return;
    void load();
  }, [user, bootstrap, bootstrapLoading, authRoleCode, load]);

  const refresh = useCallback(async () => {
    await refreshBootstrap();
    if (!bootstrap) await load();
  }, [refreshBootstrap, bootstrap, load]);

  const can = useCallback((perm: string) => perms.has(perm), [perms]);

  const value = useMemo<Ctx>(
    () => ({ loading, roleCode, permissions: perms, can, refresh }),
    [loading, roleCode, perms, can, refresh]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
}

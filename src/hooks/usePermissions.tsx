import {
  createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type PermissionKey =
  | 'recognition.use'
  | 'product.create' | 'product.edit' | 'product.delete'
  | 'price.write'
  | 'community.post' | 'community.moderate'
  | 'knowledge.personal.write' | 'knowledge.official.write'
  | 'schedule.view_self' | 'schedule.view_shop' | 'schedule.manage'
  | 'shop.kb.read' | 'shop.kb.write'
  | 'staff.manage'
  | 'role.manage'
  | 'settings.ai';

interface Ctx {
  loading: boolean;
  roleCode: string | null;
  permissions: Set<string>;
  can: (perm: PermissionKey | string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<Ctx | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
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
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role, role_code')
        .eq('user_id', user.id)
        .maybeSingle();

      const code: string =
        (roleRow as { role_code?: string | null } | null)?.role_code
        ?? (roleRow?.role === 'admin' ? 'super_admin' : 'staff');
      setRoleCode(code);

      const { data: rp } = await supabase
        .from('app_role_permissions')
        .select('permission_key')
        .eq('role_code', code);

      setPerms(new Set((rp || []).map((r: any) => r.permission_key)));
    } catch (e) {
      console.error('[Permissions] load error', e);
      setPerms(new Set());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const can = useCallback((perm: string) => perms.has(perm), [perms]);

  const value = useMemo<Ctx>(
    () => ({ loading, roleCode, permissions: perms, can, refresh: load }),
    [loading, roleCode, perms, can, load]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
}

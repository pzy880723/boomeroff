import {
  useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types';
import { clearUserCache, readUserCache, writeUserCache } from '@/lib/appCache';
import { normalizeLoginIdentity } from '@/lib/loginIdentity';
import { invokeFn } from '@/lib/invokeFn';
import { withAuthTimeout } from '@/lib/authTimeout';
import {
  decideErpSyncOutcome,
  ERP_SCOPE_RENEW_INTERVAL_MS,
  refreshErpScope,
  resetErpScopeSyncThrottle,
  readErpGovernance,
  startErpScopeRenewTimer,
} from '@/lib/erpScopeSync';
import { toast } from 'sonner';

export interface AppBootstrap {
  date: string;
  user_role: {
    role: AppRole;
    role_code: string | null;
    suspended: boolean;
    source?: 'erp' | 'legacy';
    role_codes?: string[];
  } | null;
  shop_context?: { scope: string; date?: string | null };
  permissions: string[];
  profile: {
    display_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  staff_profile: {
    real_name: string | null;
    shop_id: string | null;
  } | null;
  shifts: Array<{ work_date: string; shift_code: string }>;
  shift_definitions: Array<{
    code: string;
    name: string;
    start_time: string;
    end_time: string;
    color: string | null;
  }>;
  checked_today: boolean;
  activity: {
    id: string;
    name: string;
    cover_url: string | null;
    ends_at: string | null;
    voucher_id: string | null;
  } | null;
  okrs: Array<{
    id: string;
    title: string;
    objective: string | null;
    key_results: unknown;
    tags: string[] | null;
  }>;
  encouragement: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  roleCode: string | null;
  suspended: boolean;
  loading: boolean;
  bootstrap: AppBootstrap | null;
  bootstrapLoading: boolean;
  refreshBootstrap: () => Promise<void>;
  signIn: (account: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const BOOTSTRAP_CACHE = 'app-bootstrap';
// This is a sticky deny-only hint, not authority; clearing business caches must
// not let a previously governed account regain legacy fallback after a restart.
const ERP_GOVERNANCE_CACHE = 'erp-governance';
const USER_CACHE_SCOPES = [BOOTSTRAP_CACHE, 'permissions', 'notifications', 'tasks'];
const AUTH_STARTUP_TIMEOUT_MS = 5_000;
const AUTH_LOGIN_TIMEOUT_MS = 12_000;

function clearCachedUserData(userId: string): void {
  USER_CACHE_SCOPES.forEach((scope) => clearUserCache(scope, userId));
}

function roleCodeFallback(role: AppRole | null): string | null {
  if (!role) return null;
  return role === 'admin' ? 'super_admin' : 'staff';
}

function isBootstrap(value: unknown): value is AppBootstrap {
  return !!value && typeof value === 'object' && Array.isArray((value as AppBootstrap).permissions);
}

function deniedBootstrap(previous: AppBootstrap | null): AppBootstrap {
  return {
    date: previous?.date ?? '', user_role: null, permissions: [],
    profile: previous?.profile ?? null, staff_profile: null,
    shop_context: { scope: 'unconfigured', date: null },
    shifts: [], shift_definitions: [], checked_today: false,
    activity: null, okrs: [], encouragement: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleCode, setRoleCode] = useState<string | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const roleRequestIdRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const bootstrapRef = useRef<AppBootstrap | null>(null);
  const bootstrapRequestRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  // 受 ERP 治理的账号：失效/撤销/同步失败时不得回退到缓存里的旧角色
  const erpGovernedRef = useRef(false);
  const erpScopeActiveRef = useRef(false);
  const legacyVerifiedRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const syncRequestRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const clearErpAuthorization = useCallback((userId: string) => {
    roleRequestIdRef.current += 1;
    bootstrapRequestRef.current = null;
    erpScopeActiveRef.current = false;
    clearCachedUserData(userId);
    // Keep an explicit denied bootstrap: null would make PermissionsProvider
    // fall back to app_role_permissions and revive local operation permissions.
    const denied = deniedBootstrap(bootstrapRef.current);
    bootstrapRef.current = denied;
    setBootstrap(denied);
    setRole(null);
    setRoleCode(null);
    setSuspended(false);
    setBootstrapLoading(false);
  }, []);

  const applyBootstrap = useCallback((userId: string, value: AppBootstrap, cache: boolean) => {
    const governance = readErpGovernance(value);
    erpGovernedRef.current ||= governance.governed;
    if (erpGovernedRef.current) writeUserCache(ERP_GOVERNANCE_CACHE, userId, true);
    legacyVerifiedRef.current ||= !erpGovernedRef.current && value.user_role?.source === 'legacy';
    if (!erpGovernedRef.current && !legacyVerifiedRef.current) {
      clearErpAuthorization(userId);
      return;
    }
    if (erpGovernedRef.current && (!cache || !erpScopeActiveRef.current ||
        !governance.governed || !governance.scopeActive)) {
      clearErpAuthorization(userId);
      return;
    }
    bootstrapRef.current = value;
    setBootstrap(value);
    const nextRole = value.user_role?.role ?? 'anchor';
    setRole(nextRole);
    setRoleCode(value.user_role?.role_code ?? roleCodeFallback(nextRole));
    setSuspended(!!value.user_role?.suspended);
    if (cache && !value.user_role?.suspended) {
      writeUserCache(BOOTSTRAP_CACHE, userId, value);
    }
  }, [clearErpAuthorization]);

  const fetchBootstrap = useCallback(async (userId: string) => {
    const requestId = ++roleRequestIdRef.current;
    setBootstrapLoading(true);

    try {
      const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) => {
        window.setTimeout(() => resolve({ data: null, error: new Error('Timeout') }), 5000);
      });
      const queryPromise = supabase.rpc('app_bootstrap_v1' as never);
      const raced = await Promise.race([queryPromise, timeoutPromise]);
      const error = raced.error as unknown;
      const data = raced.data as unknown;
      if (requestId !== roleRequestIdRef.current || activeUserIdRef.current !== userId) return;

      if (!error && isBootstrap(data)) {
        applyBootstrap(userId, data, true);
        if (data.user_role?.suspended) {
          clearCachedUserData(userId);
          toast.error('账号待管理员审核通过后方可登录');
          await supabase.auth.signOut();
        }
        return;
      }

      // 受 ERP 治理且当前范围失效/撤销：绝不回退到 user_roles 或缓存里的旧角色
      if (erpGovernedRef.current || !legacyVerifiedRef.current) {
        clearErpAuthorization(userId);
        return;
      }

      // Migration may not be deployed yet. Keep the app usable during staged rollout.
      // Only a confirmed never-governed legacy account may leave the denied
      // bootstrap and use PermissionsProvider's existing table fallback.
      if (!bootstrapRef.current?.user_role) {
        bootstrapRef.current = null;
        setBootstrap(null);
      }
      const { data: roleRow, error: roleError } = await supabase
        .from('user_roles')
        .select('role, suspended, role_code')
        .eq('user_id', userId)
        .maybeSingle();
      if (requestId !== roleRequestIdRef.current || activeUserIdRef.current !== userId) return;

      if (roleError || !roleRow) {
        setRole('anchor');
        setRoleCode('staff');
        setSuspended(false);
        return;
      }

      const nextRole = roleRow.role as AppRole;
      setRole(nextRole);
      setRoleCode(roleRow.role_code ?? roleCodeFallback(nextRole));
      setSuspended(!!roleRow.suspended);
      if (roleRow.suspended) {
        clearCachedUserData(userId);
        toast.error('账号待管理员审核通过后方可登录');
        await supabase.auth.signOut();
      }
    } catch {
      if (requestId !== roleRequestIdRef.current || activeUserIdRef.current !== userId) return;
      if (erpGovernedRef.current || !legacyVerifiedRef.current) {
        clearErpAuthorization(userId);
        return;
      }
      // Cached bootstrap remains visible; RLS remains the authorization boundary.
      if (!bootstrapRef.current) {
        setRole('anchor');
        setRoleCode('staff');
        setSuspended(false);
      }
    } finally {
      if (requestId === roleRequestIdRef.current) setBootstrapLoading(false);
    }
  }, [applyBootstrap, clearErpAuthorization]);

  const loadBootstrap = useCallback((userId: string): Promise<void> => {
    const current = bootstrapRequestRef.current;
    if (current?.userId === userId) return current.promise;

    const promise = fetchBootstrap(userId).finally(() => {
      if (bootstrapRequestRef.current?.promise === promise) {
        bootstrapRequestRef.current = null;
      }
    });
    bootstrapRequestRef.current = { userId, promise };
    return promise;
  }, [fetchBootstrap]);

  // ERP 授权镜像续租；可信同步后按新授权重新拉 bootstrap。
  // 迟到响应（账号已切换/已登出）一律丢弃，绝不套用到新账号。
  const syncErpScope = useCallback((userId: string, force = false): Promise<void> => {
    if (syncRequestRef.current?.userId === userId) return syncRequestRef.current.promise;
    const generation = sessionGenerationRef.current;
    const promise = (async () => {
      const result = await refreshErpScope(force, userId);
      if (generation !== sessionGenerationRef.current) return;
      const outcome = decideErpSyncOutcome(userId, activeUserIdRef.current, result, erpGovernedRef.current);
      if (outcome.discard) return;

      erpGovernedRef.current ||= outcome.governed;
      if (erpGovernedRef.current) writeUserCache(ERP_GOVERNANCE_CACHE, userId, true);
      const verifiedData = result?.data as { is_erp_user?: boolean } | undefined;
      const legacyConfirmed = !outcome.governed && result?.sync?.status === 'unlinked' &&
        verifiedData?.is_erp_user === false;
      legacyVerifiedRef.current ||= legacyConfirmed;
      erpScopeActiveRef.current = outcome.scopeActive;
      if (outcome.clearCachedRole) clearErpAuthorization(userId);

      if (outcome.reloadBootstrap || (legacyConfirmed && !bootstrapRef.current?.user_role)) {
        bootstrapRequestRef.current = null;
        await fetchBootstrap(userId);
      }
    })().finally(() => {
      if (syncRequestRef.current?.promise === promise) syncRequestRef.current = null;
    });
    syncRequestRef.current = { userId, promise };
    return promise;
  }, [fetchBootstrap, clearErpAuthorization]);

  const beginUserSession = useCallback((nextSession: Session, forceRefresh = false) => {
    const nextUser = nextSession.user;
    const changedUser = activeUserIdRef.current !== nextUser.id;
    activeUserIdRef.current = nextUser.id;
    setSession(nextSession);
    setUser(nextUser);
    setLoading(false);

    if (changedUser) {
      sessionGenerationRef.current += 1;
      roleRequestIdRef.current += 1;
      bootstrapRequestRef.current = null;
      syncRequestRef.current = null;
      bootstrapRef.current = null;
      erpGovernedRef.current = readUserCache<boolean>(ERP_GOVERNANCE_CACHE, nextUser.id) === true;
      erpScopeActiveRef.current = false;
      legacyVerifiedRef.current = false;
      const cached = readUserCache<AppBootstrap>(BOOTSTRAP_CACHE, nextUser.id);
      if (cached && isBootstrap(cached)) applyBootstrap(nextUser.id, cached, false);
      else {
        bootstrapRef.current = null;
        setBootstrap(null);
        setRole(null);
        setRoleCode(null);
        setSuspended(false);
      }
    }

    if (changedUser || forceRefresh || !bootstrapRef.current) {
      void loadBootstrap(nextUser.id);
    }
    // 续租失败不登出身份，但受 ERP 治理的账号立即清空操作权限。
    void syncErpScope(nextUser.id, changedUser);
  }, [applyBootstrap, loadBootstrap, syncErpScope]);

  const clearSession = useCallback(() => {
    activeUserIdRef.current = null;
    sessionGenerationRef.current += 1;
    roleRequestIdRef.current += 1;
    bootstrapRequestRef.current = null;
    syncRequestRef.current = null;
    bootstrapRef.current = null;
    erpGovernedRef.current = false;
    erpScopeActiveRef.current = false;
    legacyVerifiedRef.current = false;
    resetErpScopeSyncThrottle();
    setSession(null);
    setUser(null);
    setRole(null);
    setRoleCode(null);
    setSuspended(false);
    setBootstrap(null);
    setBootstrapLoading(false);
    setLoading(false);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const userId = activeUserIdRef.current;
    if (userId) await loadBootstrap(userId);
  }, [loadBootstrap]);

  useEffect(() => {
    withAuthTimeout(
      supabase.auth.getSession(),
      AUTH_STARTUP_TIMEOUT_MS,
      '登录状态恢复超时',
    )
      .then(({ data: { session: initialSession } }) => {
        if (initialSession) beginUserSession(initialSession);
        else clearSession();
      })
      .catch(clearSession);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!nextSession) {
        clearSession();
        return;
      }

      // Token refreshes should not restart the entire app bootstrap sequence.
      if (event === 'TOKEN_REFRESHED' && activeUserIdRef.current === nextSession.user.id) {
        setSession(nextSession);
        setUser(nextSession.user);
        setLoading(false);
        return;
      }
      beginUserSession(nextSession, event === 'USER_UPDATED');
    });

    return () => subscription.unsubscribe();
  }, [beginUserSession, clearSession]);

  // 回到前台续租 + 前台每 30 秒续租（登出/切后台/卸载即停；重复触发由节流去重）
  useEffect(() => {
    const tick = () => {
      const uid = activeUserIdRef.current;
      if (!uid) return;
      if (document.visibilityState !== 'visible') return;
      void syncErpScope(uid);
    };

    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    const disposeTimer = startErpScopeRenewTimer({
      intervalMs: ERP_SCOPE_RENEW_INTERVAL_MS,
      isVisible: () => document.visibilityState === 'visible',
      isLoggedIn: () => !!activeUserIdRef.current,
      run: tick,
    });

    return () => {
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      disposeTimer();
    };
  }, [syncErpScope]);


  const signIn = async (account: string, password: string) => {
    setLoading(true);
    try {
      const identity = normalizeLoginIdentity(account);
      let data;
      let error;
      if ('phone' in identity) {
        const result = await withAuthTimeout(
          invokeFn<{ access_token: string; refresh_token: string }>(
            'phone-password-login',
            { body: { phone: identity.phone, password } },
          ),
          AUTH_LOGIN_TIMEOUT_MS,
          '登录服务响应超时，请重试',
        );
        if (result.error || !result.data?.access_token || !result.data?.refresh_token) {
          throw new Error(result.error?.message || '账号或密码错误');
        }
        ({ data, error } = await withAuthTimeout(
          supabase.auth.setSession({
            access_token: result.data.access_token,
            refresh_token: result.data.refresh_token,
          }),
          AUTH_LOGIN_TIMEOUT_MS,
          '登录状态保存超时，请重试',
        ));
      } else {
        ({ data, error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({
            email: identity.email,
            password,
          }),
          AUTH_LOGIN_TIMEOUT_MS,
          '登录服务响应超时，请重试',
        ));
      }
      if (error) throw error;
      if (data.session) beginUserSession(data.session, true);

      import('@/lib/audit').then(({ logAudit }) => {
        logAudit({ action: 'login.password', detail: { account_type: 'phone' in identity ? 'phone' : 'email' } });
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const userId = activeUserIdRef.current;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    if (userId) clearCachedUserData(userId);
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, roleCode, suspended, loading,
      bootstrap, bootstrapLoading, refreshBootstrap,
      signIn, signUp, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

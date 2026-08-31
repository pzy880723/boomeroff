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
import { toast } from 'sonner';

export interface AppBootstrap {
  date: string;
  user_role: {
    role: AppRole;
    role_code: string | null;
    suspended: boolean;
  } | null;
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

  const applyBootstrap = useCallback((userId: string, value: AppBootstrap, cache: boolean) => {
    bootstrapRef.current = value;
    setBootstrap(value);
    const nextRole = value.user_role?.role ?? 'anchor';
    setRole(nextRole);
    setRoleCode(value.user_role?.role_code ?? roleCodeFallback(nextRole));
    setSuspended(!!value.user_role?.suspended);
    if (cache && !value.user_role?.suspended) {
      writeUserCache(BOOTSTRAP_CACHE, userId, value);
    }
  }, []);

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

      // Migration may not be deployed yet. Keep the app usable during staged rollout.
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
      if (requestId !== roleRequestIdRef.current) return;
      // Cached bootstrap remains visible; RLS remains the authorization boundary.
      if (!bootstrapRef.current) {
        setRole('anchor');
        setRoleCode('staff');
        setSuspended(false);
      }
    } finally {
      if (requestId === roleRequestIdRef.current) setBootstrapLoading(false);
    }
  }, [applyBootstrap]);

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

  const beginUserSession = useCallback((nextSession: Session, forceRefresh = false) => {
    const nextUser = nextSession.user;
    const changedUser = activeUserIdRef.current !== nextUser.id;
    activeUserIdRef.current = nextUser.id;
    setSession(nextSession);
    setUser(nextUser);
    setLoading(false);

    if (changedUser) {
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
  }, [applyBootstrap, loadBootstrap]);

  const clearSession = useCallback(() => {
    activeUserIdRef.current = null;
    roleRequestIdRef.current += 1;
    bootstrapRequestRef.current = null;
    bootstrapRef.current = null;
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

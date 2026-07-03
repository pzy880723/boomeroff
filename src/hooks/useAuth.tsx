import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole } from '@/types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  suspended: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(true);
  const roleRequestIdRef = useRef(0);

  const fetchUserRole = async (userId: string) => {
    const requestId = ++roleRequestIdRef.current;
    console.log('[Auth] Fetching role for user:', userId);

    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Timeout') }), 5000)
    );

    try {
      const queryPromise = supabase
        .from('user_roles')
        .select('role, suspended')
        .eq('user_id', userId)
        .single();

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      if (requestId !== roleRequestIdRef.current) return;

      console.log('[Auth] Role query result:', { data, error });

      if (error) {
        console.error('[Auth] Error fetching user role:', error);
        setRole('anchor');
        setSuspended(false);
      } else if (data && 'role' in data) {
        setRole(data.role as AppRole);
        setSuspended(data.suspended || false);
        console.log('[Auth] Role set to:', data.role, 'Suspended:', data.suspended);
        
        // If user is suspended (pending approval or manually suspended), sign them out
        if (data.suspended) {
          console.log('[Auth] User is suspended, signing out...');
          toast.error('账号待管理员审核通过后方可登录');
          await supabase.auth.signOut();
        }
      } else {
        console.log('[Auth] No role data, using default');
        setRole('anchor');
        setSuspended(false);
      }
    } catch (error) {
      if (requestId !== roleRequestIdRef.current) return;
      console.error('[Auth] Unexpected error fetching role:', error);
      setRole('anchor');
      setSuspended(false);
    } finally {
      if (requestId !== roleRequestIdRef.current) return;
      console.log('[Auth] Setting loading to false');
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[Auth] Initializing auth state...');
    
    // 仅本地 / Lovable 沙盒里自动登录；线上正式域名不再触发，避免 “打不开的兜底页面”
    const tryDevAutoLogin = async () => {
      try {
        const host = window.location.hostname;
        const isSandbox =
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host.endsWith('.lovableproject.com') ||
          host.startsWith('id-preview--');
        if (!isSandbox) return;
        if (sessionStorage.getItem('dev-autologin-tried') === '1') return;
        sessionStorage.setItem('dev-autologin-tried', '1');
        console.log('[Auth] Sandbox detected, auto-login dev account...');
        const { error } = await supabase.auth.signInWithPassword({
          email: '87113911@qq.com',
          password: 'pzy5565283',
        });
        if (error) console.warn('[Auth] Dev auto-login failed:', error.message);
      } catch (e) {
        console.warn('[Auth] Dev auto-login error:', e);
      }
    };

    // 获取初始会话
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        console.log('[Auth] Initial session:', session ? 'exists' : 'null');
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserRole(session.user.id);
        } else {
          console.log('[Auth] No session, setting loading to false');
          setRole(null);
          setSuspended(false);
          setLoading(false);
          await tryDevAutoLogin();
        }
      })
      .catch((error) => {
        console.error('[Auth] Initial session error:', error);
        setSession(null);
        setUser(null);
        setRole(null);
        setSuspended(false);
        setLoading(false);
      });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[Auth] Auth state changed:', _event);
        setLoading(true);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // 使用 setTimeout(0) 避免死锁
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          roleRequestIdRef.current += 1;
          setRole(null);
          setSuspended(false);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setLoading(false);
      throw error;
    }
    const nextSession = data.session ?? null;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
    if (nextSession?.user) {
      // 异步写审计日志，不阻塞登录流程
      import('@/lib/audit').then(({ logAudit }) => {
        logAudit({ action: 'login.password', detail: { email } });
      }).catch(() => {});
      await fetchUserRole(nextSession.user.id);
    } else {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, role, suspended, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

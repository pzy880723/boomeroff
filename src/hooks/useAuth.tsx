import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
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
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const fetchUserRole = async (userId: string) => {
    // 防止竞态条件：如果已经在获取角色，跳过
    if (isFetchingRef.current) {
      console.log('[Auth] Already fetching role, skipping...');
      return;
    }
    isFetchingRef.current = true;
    console.log('[Auth] Fetching role for user:', userId);

    // 5秒超时保护
    const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: new Error('Timeout') }), 5000)
    );

    try {
      const queryPromise = supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      console.log('[Auth] Role query result:', { data, error });

      if (error) {
        console.error('[Auth] Error fetching user role:', error);
        setRole('anchor'); // 默认角色
      } else if (data && 'role' in data) {
        setRole(data.role as AppRole);
        console.log('[Auth] Role set to:', data.role);
      } else {
        console.log('[Auth] No role data, using default');
        setRole('anchor');
      }
    } catch (error) {
      console.error('[Auth] Unexpected error fetching role:', error);
      setRole('anchor');
    } finally {
      console.log('[Auth] Setting loading to false');
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    console.log('[Auth] Initializing auth state...');
    
    // 获取初始会话
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] Initial session:', session ? 'exists' : 'null');
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        console.log('[Auth] No session, setting loading to false');
        setLoading(false);
      }
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[Auth] Auth state changed:', _event);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // 使用 setTimeout(0) 避免死锁
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
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
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut }}>
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

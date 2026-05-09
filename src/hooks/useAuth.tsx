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
  const isFetchingRef = useRef(false);

  const fetchUserRole = async (userId: string) => {
    if (isFetchingRef.current) {
      console.log('[Auth] Already fetching role, skipping...');
      return;
    }
    isFetchingRef.current = true;
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
      console.error('[Auth] Unexpected error fetching role:', error);
      setRole('anchor');
      setSuspended(false);
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
          setSuspended(false);
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

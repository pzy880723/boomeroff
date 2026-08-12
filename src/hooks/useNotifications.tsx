import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { readUserCache, runAfterFirstPaint, writeUserCache } from '@/lib/appCache';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  type: string;
  category: string | null;
  image_url: string | null;
  created_at: string;
  expires_at: string | null;
  read: boolean;
  created_by: string | null;
  author?: { name: string | null; avatar: string | null } | null;
}

interface Ctx {
  items: NotificationItem[];
  loading: boolean;
  unreadCount: number;
  noticeUnread: number;
  newsUnread: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  updateItem: (id: string, patch: Partial<Pick<NotificationItem, 'title' | 'body' | 'summary' | 'type' | 'category' | 'image_url'>>) => Promise<void>;
}

const NotificationsContext = createContext<Ctx | undefined>(undefined);

// news / message 之外的一切归为 notice（含历史 null 数据）
function bucketOf(cat: string | null | undefined): 'news' | 'message' | 'notice' {
  const c = (cat || '').toLowerCase();
  if (c === 'news') return 'news';
  if (c === 'message') return 'message';
  return 'notice';
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const hydratedRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    if (!hydratedRef.current) setLoading(true);
    try {
      let notesQuery = supabase.from('notifications' as any)
        .select('id, title, body, summary, type, created_at, expires_at, image_url, category, created_by')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(60);
      if (role !== 'admin') notesQuery = notesQuery.neq('type', 'backup');
      const [{ data: notes }, { data: reads }] = await Promise.all([
        notesQuery,
        supabase.from('notification_reads' as any)
          .select('notification_id')
          .eq('user_id', user.id),
      ]);
      const readSet = new Set(((reads as any[]) || []).map(r => r.notification_id));
      const rawNotes = ((notes as any[]) || []);
      const authorIds = Array.from(new Set(rawNotes.map(n => n.created_by).filter(Boolean)));
      const authorMap: Record<string, { name: string | null; avatar: string | null }> = {};
      if (authorIds.length) {
        const { data: profs } = await supabase.from('profiles' as any)
          .select('user_id, display_name, avatar_url')
          .in('user_id', authorIds);
        for (const p of ((profs as any[]) || [])) {
          authorMap[p.user_id] = { name: p.display_name, avatar: p.avatar_url };
        }
      }
      const nextItems = rawNotes.map(n => ({
        ...n,
        read: readSet.has(n.id),
        author: n.created_by ? (authorMap[n.created_by] ?? null) : null,
      })) as NotificationItem[];
      hydratedRef.current = true;
      setItems(nextItems);
      writeUserCache('notifications', user.id, nextItems);
    } catch {
      // Keep the cached notifications visible when the refresh fails.
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (!user) {
      hydratedRef.current = false;
      setItems([]);
      setLoading(false);
      return;
    }
    const cached = readUserCache<NotificationItem[]>('notifications', user.id);
    if (cached) {
      hydratedRef.current = true;
      setItems(cached);
      setLoading(false);
    }
    return runAfterFirstPaint(() => { void load(); }, 650);
  }, [user, load]);

  useEffect(() => {
    if (user && hydratedRef.current) writeUserCache('notifications', user.id, items);
  }, [user, items]);

  const markRead = useCallback(async (id: string) => {
    if (!user) return;
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notification_reads' as any).upsert(
      { notification_id: id, user_id: user.id },
      { onConflict: 'notification_id,user_id' }
    );
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unread = items.filter(n => !n.read);
    if (!unread.length) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notification_reads' as any).upsert(
      unread.map(n => ({ notification_id: n.id, user_id: user.id })),
      { onConflict: 'notification_id,user_id' }
    );
  }, [user, items]);

  const removeItem = useCallback(async (id: string) => {
    const { error } = await supabase.from('notifications' as any).delete().eq('id', id);
    if (error) throw error;
    setItems(prev => prev.filter(n => n.id !== id));
  }, []);

  const updateItem = useCallback(async (id, patch) => {
    const { error } = await supabase.from('notifications' as any).update(patch).eq('id', id);
    if (error) throw error;
    setItems(prev => prev.map(n => n.id === id ? { ...n, ...patch } as NotificationItem : n));
  }, []) as Ctx['updateItem'];

  const unreadCount = items.filter(n => !n.read).length;
  const noticeUnread = items.filter(n => !n.read && bucketOf(n.category) === 'notice').length;
  const newsUnread = items.filter(n => !n.read && bucketOf(n.category) === 'news').length;


  const value = useMemo<Ctx>(
    () => ({ items, loading, unreadCount, noticeUnread, newsUnread, markRead, markAllRead, refresh: load, removeItem, updateItem }),
    [items, loading, unreadCount, noticeUnread, newsUnread, markRead, markAllRead, load, removeItem, updateItem],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    // 兜底：未挂 Provider 时返回空，避免崩溃
    return {
      items: [], loading: false, unreadCount: 0, noticeUnread: 0, newsUnread: 0,
      markRead: async () => {}, markAllRead: async () => {}, refresh: async () => {},
      removeItem: async () => {}, updateItem: async () => {},
    };
  }
  return ctx;
}

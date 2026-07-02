import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: notes }, { data: reads }] = await Promise.all([
      supabase.from('notifications' as any)
        .select('id, title, body, summary, type, created_at, expires_at, image_url, category, created_by')
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.from('notification_reads' as any)
        .select('notification_id')
        .eq('user_id', user.id),
    ]);
    const readSet = new Set(((reads as any[]) || []).map(r => r.notification_id));
    const rawNotes = ((notes as any[]) || []);
    const authorIds = Array.from(new Set(rawNotes.map(n => n.created_by).filter(Boolean)));
    let authorMap: Record<string, { name: string | null; avatar: string | null }> = {};
    if (authorIds.length) {
      const { data: profs } = await supabase.from('profiles' as any)
        .select('user_id, display_name, avatar_url')
        .in('user_id', authorIds);
      for (const p of ((profs as any[]) || [])) {
        authorMap[p.user_id] = { name: p.display_name, avatar: p.avatar_url };
      }
    }
    setItems(rawNotes.map(n => ({
      ...n,
      read: readSet.has(n.id),
      author: n.created_by ? (authorMap[n.created_by] ?? null) : null,
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

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

  const unreadCount = items.filter(n => !n.read).length;
  const noticeUnread = items.filter(n => !n.read && bucketOf(n.category) === 'notice').length;
  const newsUnread = items.filter(n => !n.read && bucketOf(n.category) === 'news').length;


  const value = useMemo<Ctx>(
    () => ({ items, loading, unreadCount, noticeUnread, newsUnread, markRead, markAllRead, refresh: load }),
    [items, loading, unreadCount, noticeUnread, newsUnread, markRead, markAllRead, load],
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
    };
  }
  return ctx;
}

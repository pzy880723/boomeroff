import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  created_at: string;
  expires_at: string | null;
  read: boolean;
}

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const [{ data: notes }, { data: reads }] = await Promise.all([
      supabase.from('notifications' as any)
        .select('id, title, body, type, created_at, expires_at')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('notification_reads' as any)
        .select('notification_id')
        .eq('user_id', user.id),
    ]);
    const readSet = new Set(((reads as any[]) || []).map(r => r.notification_id));
    setItems(((notes as any[]) || []).map(n => ({ ...n, read: readSet.has(n.id) })));
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

  return { items, loading, unreadCount, markRead, markAllRead, refresh: load };
}

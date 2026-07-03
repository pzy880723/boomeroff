// 应用启动时初始化推送 / 深链;订阅 DM 触发本地弹窗
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { initPush, showLocalNotification } from '@/lib/push';

export function PushBootstrap() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void initPush(user.id);
  }, [user]);

  // 收到新 DM -> 本地弹窗(应用打开或后台驻留时)
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('push-dm-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${user.id}`,
      }, async (payload) => {
        const m: any = payload.new;
        // 若当前正在跟该 peer 聊天,则不弹
        try {
          const h = window.location.hash || '';
          const p = window.location.pathname || '';
          if (p.includes(`/messages/${m.sender_id}`) || h.includes(`/messages/${m.sender_id}`)) return;
        } catch { /* ignore */ }
        // 取发送方昵称
        let title = '新消息';
        try {
          const { data } = await supabase.from('profiles')
            .select('display_name').eq('user_id', m.sender_id).maybeSingle();
          if ((data as any)?.display_name) title = (data as any).display_name;
        } catch { /* ignore */ }
        const body = m.body
          ? String(m.body).slice(0, 60)
          : m.attachment_type === 'video' ? '[视频]'
          : m.attachment_type === 'file' ? `[文件] ${m.attachment_name || ''}`.trim()
          : (m.image_url || m.attachment_type === 'image') ? '[图片]' : '发来一条消息';
        await showLocalNotification({
          title,
          body,
          deeplink: `/messages/${m.sender_id}`,
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  return null;
}

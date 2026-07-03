import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthPage } from '@/components/auth/AuthPage';
import { ArrowLeft, Send, Loader2, FileText, Download, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { AttachmentPicker, formatSize, type UploadedAttachment } from '@/components/messages/AttachmentPicker';
import { usePresence } from '@/lib/onlineStatus';

interface Msg {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string | null;
  image_url: string | null;
  attachment_type: 'image' | 'video' | 'file' | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  created_at: string;
  read_at: string | null;
}

interface Peer {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  real_name?: string | null;
  shop_name?: string | null;
  position?: string | null;
  role_label?: string | null;
}

const ROLE_ZH: Record<string, string> = {
  admin: '超级管理员',
  boss: '老板',
  store_manager: '店长',
  staff: '店员',
  associate: '合伙人',
  hq: '总部',
  finance: '财务',
};

const SELECT_COLS =
  'id, sender_id, receiver_id, body, image_url, attachment_type, attachment_url, attachment_name, attachment_size, attachment_mime, created_at, read_at';

export default function MessagesConversation() {
  const { peerId } = useParams<{ peerId: string }>();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [peer, setPeer] = useState<Peer | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const online = usePresence(user?.id);

  useEffect(() => {
    if (!user || !peerId) return;
    let cancelled = false;
    void (async () => {
      const [{ data: p }, { data: sp }, { data: ur }, { data: history }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url').eq('user_id', peerId).maybeSingle(),
        supabase.from('staff_profiles').select('real_name, position, shop_id').eq('user_id', peerId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', peerId).limit(1).maybeSingle(),
        supabase.from('direct_messages')
          .select(SELECT_COLS)
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);
      if (cancelled) return;
      let shop_name: string | null = null;
      const shopId = (sp as any)?.shop_id;
      if (shopId) {
        const { data: shop } = await supabase.from('shops').select('name').eq('id', shopId).maybeSingle();
        shop_name = (shop as any)?.name || null;
      }
      const roleCode = (ur as any)?.role as string | undefined;
      setPeer({
        user_id: peerId,
        display_name: (p as any)?.display_name || null,
        avatar_url: (p as any)?.avatar_url || null,
        real_name: (sp as any)?.real_name || null,
        position: (sp as any)?.position || null,
        shop_name,
        role_label: roleCode ? (ROLE_ZH[roleCode] || roleCode) : null,
      });
      setMsgs((history as Msg[]) || []);
      const unread = ((history as Msg[]) || []).filter(m => m.receiver_id === user.id && !m.read_at);
      if (unread.length) {
        await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).in('id', unread.map(u => u.id));
      }
    })();
    return () => { cancelled = true; };
  }, [user, peerId]);

  useEffect(() => {
    if (!user || !peerId) return;
    const ch = supabase.channel(`dm-${user.id}-${peerId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${user.id}`,
      }, (payload) => {
        const m = payload.new as Msg;
        if (m.sender_id !== peerId) return;
        setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
        void supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', m.id);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, peerId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (payload: {
    body?: string | null;
    att?: UploadedAttachment | null;
  }) => {
    if (!user || !peerId) return;
    const body = payload.body?.trim() || null;
    const att = payload.att || null;
    if (!body && !att) return;
    setSending(true);
    const optimistic: Msg = {
      id: 'tmp-' + Math.random(),
      sender_id: user.id, receiver_id: peerId,
      body,
      image_url: att?.kind === 'image' ? att.url : null,
      attachment_type: att?.kind || null,
      attachment_url: att?.url || null,
      attachment_name: att?.name || null,
      attachment_size: att?.size || null,
      attachment_mime: att?.mime || null,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMsgs(prev => [...prev, optimistic]);
    if (body) setText('');
    const { data, error } = await supabase.from('direct_messages').insert({
      sender_id: user.id, receiver_id: peerId,
      body,
      image_url: att?.kind === 'image' ? att.url : null,
      attachment_type: att?.kind ?? null,
      attachment_url: att?.url ?? null,
      attachment_name: att?.name ?? null,
      attachment_size: att?.size ?? null,
      attachment_mime: att?.mime ?? null,
    } as any).select(SELECT_COLS).single();
    setSending(false);
    if (error) {
      toast.error('发送失败:' + error.message);
      setMsgs(prev => prev.filter(m => m.id !== optimistic.id));
      return;
    }
    setMsgs(prev => prev.map(m => m.id === optimistic.id ? (data as Msg) : m));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-surface text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">正在加载对话…</p>
      </div>
    );
  }
  if (!user) return <AuthPage />;

  const isOnline = peer && online.has(peer.user_id);

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60 safe-top">
        <div className="mx-auto max-w-screen-md px-3 h-12 flex items-center gap-2">
          <button onClick={() => nav(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted" aria-label="返回">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            {peer?.avatar_url ? (
              <img src={peer.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold">
                {(peer?.display_name || '同').slice(0, 1)}
              </div>
            )}
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{peer?.display_name || '同事'}</p>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              {isOnline ? '在线' : '离线'}
            </p>
          </div>
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-screen-md px-3 py-3 space-y-2 overflow-y-auto pb-24">
        {msgs.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-10">还没有消息,打个招呼吧</p>
        )}
        {msgs.map(m => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words ${
                mine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-background border border-border/60 rounded-tl-sm'
              }`}>
                {m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>}
                {(m.attachment_type === 'image' || (!m.attachment_type && m.image_url)) && (m.attachment_url || m.image_url) && (
                  <img src={m.attachment_url || m.image_url!} alt="" className="rounded-lg mt-1 max-h-64 w-auto" loading="lazy" />
                )}
                {m.attachment_type === 'video' && m.attachment_url && (
                  <video src={m.attachment_url} controls playsInline preload="metadata"
                    className="rounded-lg mt-1 max-h-64 w-auto bg-black" />
                )}
                {m.attachment_type === 'file' && m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" download={m.attachment_name || undefined}
                    className={`mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                      mine ? 'bg-primary-foreground/15' : 'bg-muted'
                    }`}>
                    <FileText className="w-5 h-5 shrink-0 opacity-80" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.attachment_name || '文件'}</div>
                      <div className="opacity-70">{m.attachment_size ? formatSize(m.attachment_size) : ''}</div>
                    </div>
                    <Download className="w-4 h-4 shrink-0 opacity-70" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border/60 bg-background/95 backdrop-blur safe-bottom z-10">
        <div className="mx-auto max-w-screen-md px-3 py-2 flex items-center gap-2">
          <AttachmentPicker
            userId={user.id}
            disabled={sending}
            onUploaded={(att) => void send({ att })}
          />
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send({ body: text }); } }}
            placeholder="说点什么…"
            className="flex-1 h-10"
            disabled={sending}
          />
          <Button size="sm" onClick={() => void send({ body: text })} disabled={sending || !text.trim()} className="h-10 w-10 p-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

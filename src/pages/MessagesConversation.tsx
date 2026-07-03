import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { AuthPage } from '@/components/auth/AuthPage';
import { ArrowLeft, Send, Loader2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { uploadNotificationImage } from '@/lib/uploadNotificationImage';

interface Msg {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  read_at: string | null;
}

interface Peer {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function MessagesConversation() {
  const { peerId } = useParams<{ peerId: string }>();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [peer, setPeer] = useState<Peer | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Load peer profile + history
  useEffect(() => {
    if (!user || !peerId) return;
    let cancelled = false;
    void (async () => {
      const [{ data: p }, { data: history }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url').eq('user_id', peerId).maybeSingle(),
        supabase.from('direct_messages')
          .select('id, sender_id, receiver_id, body, image_url, created_at, read_at')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);
      if (cancelled) return;
      setPeer((p as Peer) || { user_id: peerId, display_name: '同事', avatar_url: null });
      setMsgs((history as Msg[]) || []);
      // mark unread inbound as read
      const unread = ((history as Msg[]) || []).filter(m => m.receiver_id === user.id && !m.read_at);
      if (unread.length) {
        await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).in('id', unread.map(u => u.id));
      }
    })();
    return () => { cancelled = true; };
  }, [user, peerId]);

  // Realtime
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

  const send = async (body: string | null, image_url: string | null) => {
    if (!user || !peerId) return;
    if (!body && !image_url) return;
    setSending(true);
    const optimistic: Msg = {
      id: 'tmp-' + Math.random(),
      sender_id: user.id, receiver_id: peerId,
      body, image_url,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMsgs(prev => [...prev, optimistic]);
    setText('');
    const { data, error } = await supabase.from('direct_messages').insert({
      sender_id: user.id, receiver_id: peerId,
      body, image_url,
    }).select('id, sender_id, receiver_id, body, image_url, created_at, read_at').single();
    setSending(false);
    if (error) {
      toast.error('发送失败：' + error.message);
      setMsgs(prev => prev.filter(m => m.id !== optimistic.id));
      return;
    }
    setMsgs(prev => prev.map(m => m.id === optimistic.id ? (data as Msg) : m));
  };

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const url = await uploadNotificationImage(file, user.id);
      await send(null, url);
    } catch (e: any) {
      toast.error(e?.message || '图片发送失败');
    } finally {
      setUploading(false);
    }
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

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60 safe-top">
        <div className="mx-auto max-w-screen-md px-3 h-12 flex items-center gap-2">
          <button onClick={() => nav(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted" aria-label="返回">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {peer?.avatar_url ? (
            <img src={peer.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold">
              {(peer?.display_name || '同').slice(0, 1)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{peer?.display_name || '同事'}</p>
          </div>
        </div>
      </div>

      <main className="flex-1 mx-auto w-full max-w-screen-md px-3 py-3 space-y-2 overflow-y-auto pb-24">
        {msgs.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-10">还没有消息，打个招呼吧</p>
        )}
        {msgs.map(m => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words ${
                mine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-background border border-border/60 rounded-tl-sm'
              }`}>
                {m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>}
                {m.image_url && (
                  <img src={m.image_url} alt="" className="rounded-lg mt-1 max-h-64 w-auto" loading="lazy" />
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border/60 bg-background/95 backdrop-blur safe-bottom z-10">
        <div className="mx-auto max-w-screen-md px-3 py-2 flex items-center gap-2">
          <label className="p-2 rounded-full hover:bg-muted cursor-pointer text-muted-foreground">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
            <input type="file" accept="image/*" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.currentTarget.value = ''; }} />
          </label>
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text.trim(), null); } }}
            placeholder="说点什么…"
            className="flex-1 h-10"
            disabled={sending}
          />
          <Button size="sm" onClick={() => void send(text.trim(), null)} disabled={sending || !text.trim()} className="h-10 w-10 p-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

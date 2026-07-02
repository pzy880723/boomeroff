import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { useNotifications } from '@/hooks/useNotifications';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, PencilLine, CheckCheck, Loader2, Sparkles, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey = 'notice' | 'news' | 'message';
const TAB_META: Record<TabKey, { label: string; title: string }> = {
  notice: { label: '通知', title: '通知' },
  news: { label: '资讯', title: '资讯' },
  message: { label: '消息', title: '消息' },
};
const TAB_PREF = 'notifications-tab';
function matchesTab(cat: string | null | undefined, tab: TabKey) {
  const c = (cat || '').toLowerCase();
  if (tab === 'news') return c === 'news';
  if (tab === 'message') return c === 'message';
  // notice: 缺省 / 公告类
  return !c || c === 'notice' || c === 'announcement' || c === 'policy' || c === 'urgent' || c === 'banner';
}


const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  announcement: { label: '公告', tone: 'bg-primary/10 text-primary' },
  policy: { label: '制度', tone: 'bg-foreground/10 text-foreground' },
  activity: { label: '活动', tone: 'bg-accent/50 text-accent-foreground' },
  urgent: { label: '紧急', tone: 'bg-destructive/10 text-destructive' },
};

function typeMeta(t: string) {
  return TYPE_LABEL[t] ?? { label: t || '通知', tone: 'bg-muted text-muted-foreground' };
}

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export default function Notifications() {
  const { user, role, loading: authLoading } = useAuth();
  const { items, loading, unreadCount, markRead, markAllRead, refresh } = useNotifications();
  const isAdmin = role === 'admin';

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('announcement');
  const [submitting, setSubmitting] = useState(false);

  // AI 对话式撰稿
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, aiLoading]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('rt-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        void refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, refresh]);

  const resetCompose = () => {
    setChat([]); setInput(''); setTitle(''); setBody(''); setType('announcement');
  };

  const openCompose = () => {
    resetCompose();
    setOpen(true);
  };

  const sendToAI = async () => {
    const q = input.trim();
    if (!q || aiLoading) return;
    const next: ChatTurn[] = [...chat, { role: 'user', content: q }];
    setChat(next); setInput(''); setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('spirit-chat', {
        body: {
          purpose: 'notification_compose',
          messages: [
            { role: 'system', content: '你是门店运营助手，帮助管理员撰写店铺内部通知。请用 JSON 输出：{"title":"...","body":"...","type":"announcement|policy|activity|urgent","reply":"简短回复"}。title ≤ 30 字，body 简洁分段。' },
            ...next.map(t => ({ role: t.role, content: t.content })),
          ],
        },
      });
      if (error) throw error;
      const raw = (data as any)?.text || (data as any)?.reply || (data as any)?.content || '';
      let parsed: any = null;
      try {
        const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch { /* ignore */ }
      if (parsed && (parsed.title || parsed.body)) {
        setTitle(parsed.title || '');
        setBody(parsed.body || '');
        if (parsed.type) setType(parsed.type);
        setChat([...next, { role: 'assistant', content: parsed.reply || '草稿已生成，可在下方微调后发布。' }]);
      } else {
        setChat([...next, { role: 'assistant', content: String(raw) || '（AI 无返回，请再描述一下）' }]);
      }
    } catch (e: any) {
      setChat([...next, { role: 'assistant', content: '生成失败：' + (e?.message || '未知错误') }]);
    } finally {
      setAiLoading(false);
    }
  };

  const publish = async () => {
    if (!title.trim() || !body.trim()) { toast.error('标题和内容不能为空'); return; }
    setSubmitting(true);
    const { data: inserted, error } = await supabase.from('notifications' as any).insert({
      title: title.trim(),
      body: body.trim(),
      type,
      active: true,
      created_by: user!.id,
    }).select('id').single();
    setSubmitting(false);
    if (error) { toast.error('发布失败：' + error.message); return; }
    toast.success('通知已发布');
    resetCompose();
    setOpen(false);
    void refresh();
    if ((inserted as any)?.id) {
      void supabase.functions.invoke('generate-notification-banner', {
        body: { notification_id: (inserted as any).id, title: title.trim(), body: body.trim() },
      }).then(() => refresh()).catch(() => {});
    }
  };

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="通知"
        right={
          unreadCount > 0 ? (
            <Button size="sm" variant="ghost" onClick={markAllRead}>
              <CheckCheck className="w-4 h-4 mr-1" />全部已读
            </Button>
          ) : null
        }
      />

      <main className="mx-auto max-w-screen-md px-4 py-4 space-y-3">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无通知</p>
          </div>
        ) : (
          items.map(n => {
            const meta = typeMeta(n.type);
            return (
              <Card
                key={n.id}
                className={`p-4 shadow-hard cursor-pointer transition ${n.read ? 'opacity-70' : 'border-primary/40'}`}
                onClick={() => !n.read && markRead(n.id)}
              >
                <div className="flex items-start gap-3">
                  {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`${meta.tone} border-0 text-[10px] px-1.5 py-0`}>{meta.label}</Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold mb-1">{n.title}</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{n.body}</p>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </main>

      {/* 管理员：AI 撰稿浮标（避开 BOOMER 浮标位置） */}
      {isAdmin && (
        <button
          type="button"
          aria-label="AI 撰稿发通知"
          onClick={openCompose}
          className="fixed right-4 bottom-40 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition"
        >
          <PencilLine className="w-5 h-5" />
        </button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetCompose(); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" /> AI 撰稿 · 发通知
            </DialogTitle>
          </DialogHeader>

          {/* 对话区 */}
          <div className="max-h-[240px] overflow-y-auto px-4 py-2 space-y-2 border-b border-border/50 bg-muted/30">
            {chat.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                告诉我要发什么，例如：<br />
                <span className="text-foreground">"提醒大家周五闭店盘点，晚 8 点集合。"</span>
              </p>
            )}
            {chat.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                <span className={`inline-block max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                  t.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background border border-border/60'
                }`}>{t.content}</span>
              </div>
            ))}
            {aiLoading && (
              <div className="text-left">
                <span className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl text-sm bg-background border border-border/60">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 生成中…
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 输入 */}
          <div className="px-4 py-2 flex gap-2 border-b border-border/50">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void sendToAI(); } }}
              placeholder="用一句话描述这条通知的内容…"
              className="flex-1 h-9"
              disabled={aiLoading}
            />
            <Button size="sm" onClick={sendToAI} disabled={aiLoading || !input.trim()} className="h-9">
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* 草稿预览 & 微调 */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex gap-2">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="announcement">公告</SelectItem>
                  <SelectItem value="policy">制度</SelectItem>
                  <SelectItem value="activity">活动</SelectItem>
                  <SelectItem value="urgent">紧急</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="通知标题"
                maxLength={60}
                className="flex-1 h-8 text-sm font-semibold"
              />
            </div>
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="AI 会把草稿写在这里，你可以直接改。"
              maxLength={2000}
              className="text-sm"
            />
          </div>

          <DialogFooter className="px-4 pb-4">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={publish} disabled={submitting || !title.trim() || !body.trim()}>
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}发布通知
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

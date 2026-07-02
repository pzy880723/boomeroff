import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MessageCircle, PencilLine, CheckCheck, Loader2, Sparkles, Send, ImagePlus, X, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadNotificationImage } from '@/lib/uploadNotificationImage';
import { MarkdownArticle } from '@/components/notifications/MarkdownArticle';
import { NotificationDetailSheet } from '@/components/notifications/NotificationDetailSheet';

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
  const { items, loading, markRead, refresh } = useNotifications();
  const isAdmin = role === 'admin';

  const [sp, setSp] = useSearchParams();
  const initialTab = (() => {
    const q = sp.get('tab');
    if (q === 'news' || q === 'message' || q === 'notice') return q as TabKey;
    try {
      const v = localStorage.getItem(TAB_PREF);
      if (v === 'news' || v === 'message' || v === 'notice') return v as TabKey;
    } catch { /* ignore */ }
    return 'notice';
  })();
  const [tab, setTab] = useState<TabKey>(initialTab);
  useEffect(() => {
    try { localStorage.setItem(TAB_PREF, tab); } catch { /* ignore */ }
    if (sp.get('tab') !== tab) {
      const next = new URLSearchParams(sp);
      next.set('tab', tab);
      setSp(next, { replace: true });
    }
  }, [tab, sp, setSp]);

  const filteredItems = useMemo(
    () => items.filter(n => matchesTab(n.category, tab)),
    [items, tab],
  );
  const tabUnread = useMemo(() => filteredItems.filter(n => !n.read).length, [filteredItems]);

  // 每分栏未读计数
  const unreadByTab = useMemo(() => {
    const m: Record<TabKey, number> = { notice: 0, news: 0, message: 0 };
    for (const n of items) {
      if (n.read) continue;
      (['notice', 'news', 'message'] as TabKey[]).forEach(k => {
        if (matchesTab(n.category, k)) m[k] += 1;
      });
    }
    return m;
  }, [items]);

  // 打开详情
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);
  const openDetail = (n: NotificationItem) => {
    setDetailItem(n);
    if (!n.read) void markRead(n.id);
  };

  // 处理 ?open= 深链
  const openParam = sp.get('open');
  useEffect(() => {
    if (!openParam || !items.length) return;
    const hit = items.find(n => n.id === openParam);
    if (hit) {
      setDetailItem(hit);
      if (!hit.read) void markRead(hit.id);
      const next = new URLSearchParams(sp);
      next.delete('open');
      setSp(next, { replace: true });
    }
  }, [openParam, items, markRead, sp, setSp]);

  // 撰稿弹窗状态
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('announcement');
  const [category, setCategory] = useState<TabKey>('notice');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [insertingImg, setInsertingImg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // AI 对话
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, aiLoading]);

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
    setChat([]); setInput(''); setTitle(''); setBody('');
    setType('announcement'); setCategory(tab); setCoverUrl(''); setEditorTab('edit');
  };
  const openCompose = () => { resetCompose(); setOpen(true); };

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
            { role: 'system', content: '你是门店运营助手，帮助管理员撰写店铺内部通知或资讯长文。请用 JSON 输出：{"title":"...","body":"...","type":"announcement|policy|activity|urgent","reply":"简短回复"}。title ≤ 30 字。body 支持 Markdown 语法（## 小标题、- 列表、**加粗**），可分段。' },
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

  const handleCoverPick = async (file: File | null) => {
    if (!file || !user) return;
    setUploadingCover(true);
    try {
      const url = await uploadNotificationImage(file, user.id);
      setCoverUrl(url);
    } catch (e: any) {
      toast.error(e?.message || '封面上传失败');
    } finally {
      setUploadingCover(false);
    }
  };

  const insertBodyImage = async (file: File) => {
    if (!user) return;
    setInsertingImg(true);
    try {
      const url = await uploadNotificationImage(file, user.id);
      const snippet = `\n\n![](${url})\n\n`;
      const ta = bodyRef.current;
      if (ta) {
        const start = ta.selectionStart ?? body.length;
        const end = ta.selectionEnd ?? body.length;
        const next = body.slice(0, start) + snippet + body.slice(end);
        setBody(next);
        // 光标定位到插入后
        requestAnimationFrame(() => {
          ta.focus();
          const pos = start + snippet.length;
          ta.setSelectionRange(pos, pos);
        });
      } else {
        setBody(body + snippet);
      }
    } catch (e: any) {
      toast.error(e?.message || '图片上传失败');
    } finally {
      setInsertingImg(false);
    }
  };

  const handleBodyPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void insertBodyImage(file);
    }
  };

  const publish = async () => {
    if (!title.trim() || !body.trim()) { toast.error('标题和内容不能为空'); return; }
    setSubmitting(true);
    const { data: inserted, error } = await supabase.from('notifications' as any).insert({
      title: title.trim(),
      body: body.trim(),
      type,
      category,
      image_url: coverUrl || null,
      active: true,
      created_by: user!.id,
    }).select('id').single();
    setSubmitting(false);
    if (error) { toast.error('发布失败：' + error.message); return; }
    toast.success(`${TAB_META[category].label}已发布`);
    resetCompose();
    setOpen(false);
    void refresh();
    // 仅当没有手动封面且为资讯时，自动生成 banner
    if ((inserted as any)?.id && category === 'news' && !coverUrl) {
      void supabase.functions.invoke('generate-notification-banner', {
        body: { notification_id: (inserted as any).id, title: title.trim(), body: body.trim() },
      }).then(() => refresh()).catch(() => {});
    }
  };

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  const markAllReadInTab = async () => {
    for (const n of filteredItems) if (!n.read) await markRead(n.id);
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="消息"
        right={
          tabUnread > 0 ? (
            <Button size="sm" variant="ghost" onClick={markAllReadInTab}>
              <CheckCheck className="w-4 h-4 mr-1" />全部已读
            </Button>
          ) : null
        }
      />

      <main className="mx-auto max-w-screen-md px-4 py-3 space-y-3">
        {/* 分栏切换（右上角未读角标） */}
        <div className="inline-flex rounded-full bg-muted p-0.5 text-xs w-full max-w-xs">
          {(['notice', 'news', 'message'] as TabKey[]).map(k => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'relative flex-1 h-7 rounded-full font-medium transition-colors',
                tab === k ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
              )}
            >
              {TAB_META[k].label}
              {unreadByTab[k] > 0 && (
                <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold">
                  {unreadByTab[k] > 99 ? '99+' : unreadByTab[k]}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'message' && filteredItems.length === 0 && !loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">跨设备聊天功能即将上线</p>
          </div>
        ) : loading && filteredItems.length === 0 ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无{TAB_META[tab].label}</p>
          </div>
        ) : (
          filteredItems.map(n => {
            const meta = typeMeta(n.type);
            return (
              <Card
                key={n.id}
                className={`p-4 shadow-hard cursor-pointer transition ${n.read ? 'opacity-70' : 'border-primary/40'}`}
                onClick={() => openDetail(n)}
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
                    <h3 className="text-sm font-bold mb-1 line-clamp-2">{n.title}</h3>
                    {n.image_url && (
                      <img
                        src={n.image_url}
                        alt={n.title}
                        loading="lazy"
                        className="mt-2 w-full aspect-[16/7] object-cover rounded-md"
                      />
                    )}
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mt-1">
                      {n.body.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/[#*_>`-]+/g, ' ').trim()}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </main>

      {/* 详情 Sheet */}
      <NotificationDetailSheet item={detailItem} onOpenChange={(v) => !v && setDetailItem(null)} />

      {/* 管理员：AI 撰稿浮标 */}
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
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-4 pt-4 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" /> AI 撰稿 · 发布消息
            </DialogTitle>
          </DialogHeader>

          {/* AI 对话区 */}
          <div className="max-h-[180px] overflow-y-auto px-4 py-2 space-y-2 border-b border-border/50 bg-muted/30 shrink-0">
            {chat.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                告诉我要发什么，AI 会生成草稿；也可以直接跳过对话手写。
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

          <div className="px-4 py-2 flex gap-2 border-b border-border/50 shrink-0">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void sendToAI(); } }}
              placeholder="用一句话描述内容，AI 帮你写…"
              className="flex-1 h-9"
              disabled={aiLoading}
            />
            <Button size="sm" onClick={sendToAI} disabled={aiLoading || !input.trim()} className="h-9">
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {/* 分类 & 标题 */}
          <div className="px-4 py-3 space-y-2 shrink-0 border-b border-border/50">
            <div className="flex gap-2">
              <Select value={category} onValueChange={(v) => setCategory(v as TabKey)}>
                <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="notice">通知</SelectItem>
                  <SelectItem value="news">资讯</SelectItem>
                  <SelectItem value="message">消息</SelectItem>
                </SelectContent>
              </Select>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
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
                placeholder="标题"
                maxLength={60}
                className="flex-1 h-8 text-sm font-semibold"
              />
            </div>

            {/* 封面 Banner 上传（资讯尤其重要，其他也可用） */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">封面 Banner{category === 'news' ? '（首页轮播使用）' : '（可选）'}</p>
              {coverUrl ? (
                <div className="relative rounded-md overflow-hidden border border-border/60">
                  <img src={coverUrl} alt="cover" className="w-full aspect-[16/7] object-cover" />
                  <button
                    type="button"
                    onClick={() => setCoverUrl('')}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                    aria-label="移除封面"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-16 rounded-md border border-dashed border-border/70 cursor-pointer hover:bg-muted/50 transition text-xs text-muted-foreground">
                  {uploadingCover ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 上传中…</>
                  ) : (
                    <><Upload className="w-4 h-4" /> 点击选择封面（≤5MB）</>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCover}
                    onChange={e => { void handleCoverPick(e.target.files?.[0] || null); e.currentTarget.value = ''; }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* 正文编辑/预览 */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <Tabs value={editorTab} onValueChange={(v) => setEditorTab(v as 'edit' | 'preview')}>
              <div className="flex items-center justify-between mb-2">
                <TabsList className="h-8">
                  <TabsTrigger value="edit" className="text-xs">编辑</TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs">预览</TabsTrigger>
                </TabsList>
                {editorTab === 'edit' && (
                  <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:opacity-80">
                    {insertingImg ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 插入中…</>
                    ) : (
                      <><ImagePlus className="w-3.5 h-3.5" /> 插入图片</>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={insertingImg}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) void insertBodyImage(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              <TabsContent value="edit" className="mt-0">
                <Textarea
                  ref={bodyRef}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onPaste={handleBodyPaste}
                  rows={8}
                  placeholder={'支持 Markdown。示例：\n## 小标题\n- 要点一\n- 要点二\n\n![](图片会自动插入)'}
                  maxLength={5000}
                  className="text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">支持 Markdown、粘贴图片直接上传</p>
              </TabsContent>
              <TabsContent value="preview" className="mt-0">
                <div className="rounded-lg border border-border/60 bg-background overflow-hidden">
                  {coverUrl && (
                    <img src={coverUrl} alt="preview" className="w-full aspect-[16/7] object-cover" />
                  )}
                  <div className="p-4">
                    {title && <h2 className="text-base font-bold mb-2">{title}</h2>}
                    {body ? (
                      <MarkdownArticle content={body} />
                    ) : (
                      <p className="text-xs text-muted-foreground">正文为空</p>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="px-4 pb-4 shrink-0 border-t border-border/50 pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={publish} disabled={submitting || !title.trim() || !body.trim()}>
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

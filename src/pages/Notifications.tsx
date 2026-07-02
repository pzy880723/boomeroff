import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  MessageCircle, PencilLine, CheckCheck, Loader2, Sparkles, Send,
  ImagePlus, X, Upload, Image as ImageIcon, Users2, ChevronRight, Pencil, Bell, Search, Filter,
  Eye, MessageSquare, History, Wand2, RefreshCw, Save, Inbox, Trash2, Crop,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { uploadNotificationImage } from '@/lib/uploadNotificationImage';
import { MarkdownArticle } from '@/components/notifications/MarkdownArticle';
import { NotificationDetailSheet } from '@/components/notifications/NotificationDetailSheet';
import { NotificationBannerCropper } from '@/components/notifications/NotificationBannerCropper';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { listDrafts, saveDraft, removeDraft, type NotificationDraft } from '@/lib/notificationDrafts';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type TabKey = 'notice' | 'news' | 'message';
const TAB_META: Record<TabKey, { label: string }> = {
  notice: { label: '通知' },
  news: { label: '资讯' },
  message: { label: '消息' },
};
const TAB_PREF = 'notifications-tab';

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  announcement: { label: '公告', tone: 'bg-primary/10 text-primary' },
  policy: { label: '制度', tone: 'bg-foreground/10 text-foreground' },
  activity: { label: '活动', tone: 'bg-accent/50 text-accent-foreground' },
  urgent: { label: '紧急', tone: 'bg-destructive/10 text-destructive' },
  system: { label: '系统', tone: 'bg-muted text-muted-foreground' },
  shift: { label: '排班', tone: 'bg-accent/50 text-accent-foreground' },
  notice: { label: '通知', tone: 'bg-primary/10 text-primary' },
};
function typeMeta(t: string) {
  return TYPE_LABEL[t] ?? { label: t || '通知', tone: 'bg-muted text-muted-foreground' };
}

function bucketOf(cat: string | null | undefined): TabKey {
  const c = (cat || '').toLowerCase();
  if (c === 'news') return 'news';
  if (c === 'message') return 'message';
  return 'notice';
}

type ChatTurn = { role: 'user' | 'assistant'; content: string };

interface StaffPeer {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  last_message?: string | null;
  last_at?: string | null;
  unread?: number;
}

export default function Notifications() {
  const { user, role, loading: authLoading } = useAuth();
  const { items, loading, markRead, refresh, noticeUnread, newsUnread } = useNotifications();
  const isAdmin = role === 'admin';

  const [sp, setSp] = useSearchParams();
  const initialTab = (() => {
    const q = sp.get('tab');
    if (q === 'notice' || q === 'news' || q === 'message') return q as TabKey;
    try {
      const v = localStorage.getItem(TAB_PREF);
      if (v === 'notice' || v === 'news' || v === 'message') return v as TabKey;
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

  const noticeItems = useMemo(
    () => items.filter(n => bucketOf(n.category) === 'notice'),
    [items],
  );
  const newsItems = useMemo(
    () => items.filter(n => bucketOf(n.category) === 'news'),
    [items],
  );
  const baseListItems = tab === 'notice' ? noticeItems : tab === 'news' ? newsItems : [];
  const currentUnread = tab === 'notice' ? noticeUnread : tab === 'news' ? newsUnread : 0;

  // 搜索 & 类型筛选
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const currentListItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return baseListItems.filter(n => {
      if (typeFilter !== 'all' && (n.type || '') !== typeFilter) return false;
      if (!kw) return true;
      return (n.title || '').toLowerCase().includes(kw) || (n.body || '').toLowerCase().includes(kw);
    });
  }, [baseListItems, keyword, typeFilter]);
  const hasFilter = keyword.trim() !== '' || typeFilter !== 'all';


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
  const [category, setCategory] = useState<TabKey>('news');
  const [coverUrl, setCoverUrl] = useState<string>('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [insertingImg, setInsertingImg] = useState(false);
  const [genBannerBusy, setGenBannerBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // 裁剪状态
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const replaceCoverInputRef = useRef<HTMLInputElement>(null);

  // 草稿箱
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<NotificationDraft[]>([]);
  const [draftBoxOpen, setDraftBoxOpen] = useState(false);
  const refreshDrafts = () => setDrafts(listDrafts());
  useEffect(() => { refreshDrafts(); }, []);


  // AI 对话
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, aiLoading]);

  // 视图 & 版本历史
  const [view, setView] = useState<'chat' | 'preview'>('chat');
  const [versions, setVersions] = useState<{ title: string; body: string; type: string; at: string }[]>([]);
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0 && view === 'chat') setView('preview');
    else if (dx > 0 && view === 'preview') setView('chat');
  };
  const hasDraft = !!(title.trim() || body.trim());

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('rt-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        void refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, refresh]);

  const resetCompose = (defaultCat: TabKey = 'notice') => {
    setChat([]); setInput(''); setTitle(''); setBody('');
    setType('announcement'); setCategory(defaultCat); setCoverUrl(''); setEditingBody(false);
    setVersions([]); setView('chat'); setCurrentDraftId(null);
  };
  const openCompose = () => {
    resetCompose(tab === 'message' ? 'notice' : tab);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const saveCurrentDraft = (silent = false) => {
    if (!title.trim() && !body.trim() && !coverUrl) {
      if (!silent) toast.error('标题、正文或封面至少填一项');
      return;
    }
    const saved = saveDraft({
      id: currentDraftId ?? undefined,
      title, body, type, category, coverUrl,
    });
    setCurrentDraftId(saved.id);
    refreshDrafts();
    if (!silent) toast.success('已保存到草稿箱');
  };

  const loadDraft = (d: NotificationDraft) => {
    setCurrentDraftId(d.id);
    setTitle(d.title); setBody(d.body); setType(d.type);
    setCategory(d.category as TabKey); setCoverUrl(d.coverUrl);
    setChat([]); setInput(''); setVersions([]); setView('preview');
    setDraftBoxOpen(false);
    setOpen(true);
  };

  const deleteDraft = (id: string) => {
    removeDraft(id);
    refreshDrafts();
    if (currentDraftId === id) setCurrentDraftId(null);
  };

  const handleCloseCompose = () => {
    const hasChanges = !!(title.trim() || body.trim() || coverUrl);
    if (hasChanges && !currentDraftId) {
      saveCurrentDraft(true);
      toast('已自动保存到草稿箱', { icon: <Inbox className="w-4 h-4" /> });
    }
    setOpen(false);
    resetCompose();
  };



  const sendToAI = async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || aiLoading) return;
    const next: ChatTurn[] = [...chat, { role: 'user', content: q }];
    setChat(next);
    if (!override) setInput('');
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('compose-notification', {
        body: {
          messages: next.map(t => ({ role: t.role, content: t.content })),
          current_draft: hasDraft ? { title, body, type } : null,
        },
      });
      if (error) throw error;
      const d = (data ?? {}) as {
        error?: string;
        need_more?: boolean;
        reply?: string;
        title?: string;
        body?: string;
        type?: string;
      };
      if (d.error) throw new Error(d.error);
      if (!d.need_more && (d.title || d.body)) {
        const nt = d.title || title;
        const nb = d.body || body;
        const ntype = d.type || type;
        setTitle(nt); setBody(nb); if (d.type) setType(d.type);
        setVersions(v => [...v, { title: nt, body: nb, type: ntype, at: new Date().toISOString() }]);
        setChat([...next, { role: 'assistant', content: d.reply || '草稿已生成 ✅ 点「查看预览」看看效果' }]);
        toast.success('草稿已生成', {
          action: { label: '查看预览', onClick: () => setView('preview') },
        });
      } else {
        setChat([...next, { role: 'assistant', content: d.reply || '再多告诉我一点信息呢？' }]);
      }
    } catch (e: any) {
      setChat([...next, { role: 'assistant', content: '生成失败：' + (e?.message || '未知错误') + '\n再说一次试试？' }]);
    } finally {
      setAiLoading(false);
    }
  };

  const applyVersion = (idx: number) => {
    const v = versions[idx];
    if (!v) return;
    setTitle(v.title); setBody(v.body); setType(v.type);
  };

  const CHIPS: { label: string; prompt: string }[] = [
    { label: '📢 发公告', prompt: '发一条公告，主题是：' },
    { label: '📋 发制度', prompt: '发一条制度说明，内容是：' },
    { label: '🎉 发活动', prompt: '发一条门店活动通知，活动是：' },
    { label: '🚨 紧急通知', prompt: '发一条紧急通知：' },
  ];
  const REFINE_CHIPS = ['更短一些', '更正式一些', '更活泼一些', '加点数据', '换个角度再写一版'];

  const pickCoverFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('图片过大，请压缩至 8MB 内'); return; }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  };

  const applyCroppedBanner = async (blob: Blob) => {
    if (!user) return;
    setUploadingCover(true);
    try {
      const file = new File([blob], 'banner.jpg', { type: 'image/jpeg' });
      const url = await uploadNotificationImage(file, user.id);
      setCoverUrl(url);
      setCropSrc(null);
    } catch (e: any) {
      toast.error(e?.message || '封面上传失败');
    } finally {
      setUploadingCover(false);
    }
  };

  const generateBannerByAI = async () => {
    if (!title.trim() && !body.trim()) { toast.error('先生成正文，再让 AI 画封面'); return; }
    setGenBannerBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-notification-banner', {
        body: { title: title.trim(), body: body.trim(), preview_only: true },
      });
      if (error) throw error;
      const url = (data as any)?.image_url || (data as any)?.url;
      if (!url) throw new Error('未返回图片');
      // 让用户裁剪
      setCropSrc(url);
    } catch (e: any) {
      toast.error(e?.message || 'AI 生成失败');
    } finally {
      setGenBannerBusy(false);
    }
  };

  const insertBodyImage = async (file: File) => {
    if (!user) return;
    setInsertingImg(true);
    try {
      const url = await uploadNotificationImage(file, user.id);
      const snippet = `\n\n![](${url})\n\n`;
      const ta = bodyRef.current;
      if (ta && editingBody) {
        const start = ta.selectionStart ?? body.length;
        const end = ta.selectionEnd ?? body.length;
        const next = body.slice(0, start) + snippet + body.slice(end);
        setBody(next);
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

  const publish = async () => {
    if (!title.trim() || !body.trim()) { toast.error('标题和内容不能为空'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('notifications' as any).insert({
      title: title.trim(),
      body: body.trim(),
      type,
      category,
      image_url: coverUrl || null,
      active: true,
      created_by: user!.id,
    });
    setSubmitting(false);
    if (error) { toast.error('发布失败：' + error.message); return; }
    toast.success(`${TAB_META[category].label}已发布`);
    resetCompose();
    setOpen(false);
    void refresh();
  };

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  const markAllReadInTab = async () => {
    for (const n of currentListItems) if (!n.read) await markRead(n.id);
  };

  const TAB_UNREAD: Record<TabKey, number> = {
    notice: noticeUnread, news: newsUnread, message: 0,
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="消息"
        right={
          tab !== 'message' && currentUnread > 0 ? (
            <Button size="sm" variant="ghost" onClick={markAllReadInTab}>
              <CheckCheck className="w-4 h-4 mr-1" />全部已读
            </Button>
          ) : null
        }
      />

      <main className="mx-auto max-w-screen-md px-4 py-3 space-y-3">
        {/* 3 分栏切换 */}
        <div className="inline-flex rounded-full bg-muted p-0.5 text-xs w-full max-w-[320px]">
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
              {TAB_UNREAD[k] > 0 && (
                <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4 font-semibold">
                  {TAB_UNREAD[k] > 99 ? '99+' : TAB_UNREAD[k]}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab !== 'message' && (
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder={`搜索${TAB_META[tab].label}标题或内容`}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="清除搜索"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <Filter className="w-3.5 h-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="announcement">公告</SelectItem>
                <SelectItem value="policy">制度</SelectItem>
                <SelectItem value="activity">活动</SelectItem>
                <SelectItem value="urgent">紧急</SelectItem>
                <SelectItem value="system">系统</SelectItem>
                <SelectItem value="shift">排班</SelectItem>
                <SelectItem value="notice">通知</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {tab === 'message' ? (
          <StaffMessagesList userId={user.id} />
        ) : loading && currentListItems.length === 0 ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : currentListItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {tab === 'notice' ? <Bell className="w-10 h-10 mx-auto mb-3 opacity-50" /> : <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />}
            <p className="text-sm">{hasFilter ? '没有匹配的' + TAB_META[tab].label : '暂无' + TAB_META[tab].label}</p>
            {hasFilter && (
              <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setKeyword(''); setTypeFilter('all'); }}>
                清除筛选
              </Button>
            )}
          </div>
        ) : currentListItems.map(n => {
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
                  {n.image_url && tab === 'news' && (
                    <img
                      src={n.image_url}
                      alt={n.title}
                      loading="lazy"
                      className="mt-2 w-full aspect-[16/6] object-cover rounded-md"
                    />
                  )}
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed mt-1">
                    {n.body.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/[#*_>`-]+/g, ' ').trim()}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </main>

      {/* 详情 Sheet */}
      <NotificationDetailSheet item={detailItem} onOpenChange={(v) => !v && setDetailItem(null)} />

      {/* 管理员：AI 撰稿浮标（通知/资讯 都可发） */}
      {isAdmin && tab !== 'message' && (
        <button
          type="button"
          aria-label={`发${TAB_META[tab].label}`}
          onClick={openCompose}
          className="fixed right-4 bottom-40 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition"
        >
          <PencilLine className="w-5 h-5" />
        </button>
      )}


      {/* 撰稿弹窗：对话为主，预览可切换/侧滑 */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetCompose(); }}>
        <DialogContent className="max-w-none w-screen h-[100dvh] sm:rounded-none rounded-none p-0 gap-0 border-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
          <DialogHeader className="px-3 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 shrink-0 border-b border-border/50 space-y-0">
            <div className="flex items-center gap-2 h-11">
              <DialogTitle className="flex items-center gap-1.5 text-sm shrink-0">
                <Sparkles className="w-4 h-4 text-primary" /> AI 撰稿
              </DialogTitle>
              <div className="flex-1 flex justify-center">
                <Tabs value={view} onValueChange={(v) => setView(v as 'chat' | 'preview')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="chat" className="h-6 px-3 text-xs gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />对话
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="h-6 px-3 text-xs gap-1 relative">
                      <Eye className="w-3.5 h-3.5" />预览
                      {hasDraft && view !== 'preview' && (
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); resetCompose(); }}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </DialogHeader>

          {/* 主体：左右滑动切换 */}
          <div
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {view === 'chat' ? (
              <>
                {/* 快捷模板 chip */}
                <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2 shrink-0">
                  {CHIPS.map(c => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => { setInput(c.prompt); setTimeout(() => inputRef.current?.focus(), 20); }}
                      className="h-7 px-3 rounded-full text-xs bg-muted hover:bg-muted/70 border border-border/50"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* 对话消息流 */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 bg-muted/20">
                  {chat.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground">
                      <Wand2 className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p className="text-xs">告诉我要发什么，我会直接帮你出稿</p>
                      <p className="text-[11px] mt-1 opacity-70">例：明天早上 9 点全员参加培训</p>
                    </div>
                  )}
                  {chat.map((t, i) => {
                    const isUser = t.role === 'user';
                    const isLastAssistant = !isUser && i === chat.length - 1;
                    return (
                      <div key={i} className={isUser ? 'flex justify-end' : 'flex flex-col items-start gap-2'}>
                        <span className={cn(
                          'inline-block max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words',
                          isUser
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-background border border-border/60 rounded-bl-md',
                        )}>{t.content}</span>
                        {isLastAssistant && hasDraft && (
                          <div className="flex flex-wrap gap-1.5 max-w-[85%]">
                            <button
                              type="button"
                              onClick={() => setView('preview')}
                              className="inline-flex items-center gap-1 h-7 px-3 rounded-full text-xs bg-primary text-primary-foreground"
                            >
                              <Eye className="w-3 h-3" />查看预览
                            </button>
                            {REFINE_CHIPS.map(r => (
                              <button
                                key={r}
                                type="button"
                                disabled={aiLoading}
                                onClick={() => void sendToAI(r)}
                                className="h-7 px-3 rounded-full text-xs bg-muted hover:bg-muted/70 border border-border/50 disabled:opacity-50"
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {aiLoading && (
                    <div className="flex">
                      <span className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl text-xs bg-background border border-border/60">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在写…
                      </span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* 底部输入区 */}
                <div className="shrink-0 border-t border-border/50 px-3 py-2 flex items-end gap-2 bg-background">
                  <button
                    type="button"
                    onClick={() => setView('preview')}
                    disabled={!hasDraft}
                    className={cn(
                      'shrink-0 w-9 h-9 rounded-full flex items-center justify-center relative transition',
                      hasDraft ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-muted text-muted-foreground/60',
                    )}
                    aria-label="查看预览"
                  >
                    <Eye className="w-4 h-4" />
                    {hasDraft && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={chat.length === 0 ? '发一条通知…' : '继续补充…'}
                    rows={2}
                    className="flex-1 min-h-[44px] max-h-32 resize-none text-sm py-2"
                    disabled={aiLoading}
                  />
                  <Button
                    size="sm"
                    onClick={() => void sendToAI()}
                    disabled={aiLoading || !input.trim()}
                    className="h-9 w-9 p-0 shrink-0"
                  >
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {/* 预览页顶部：分类/类型/标题 + 版本切换 */}
                <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border/50 space-y-2">
                  <div className="flex gap-2">
                    <Select value={category} onValueChange={(v) => setCategory(v as TabKey)}>
                      <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="notice">通知</SelectItem>
                        <SelectItem value="news">资讯</SelectItem>
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
                  {versions.length > 1 && (
                    <div className="flex items-center gap-2">
                      <History className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">历史版本：</span>
                      <div className="flex-1 flex flex-wrap gap-1">
                        {versions.map((v, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => applyVersion(i)}
                            className={cn(
                              'h-6 px-2 rounded-full text-[11px] border',
                              title === v.title && body === v.body
                                ? 'bg-primary/15 text-primary border-primary/40'
                                : 'bg-muted hover:bg-muted/70 border-border/50',
                            )}
                          >
                            v{i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 预览卡片 */}
                <div className="flex-1 overflow-y-auto px-4 py-3 bg-muted/30">
                  <div className="rounded-xl border border-border/60 bg-background overflow-hidden shadow-sm">
                    {coverUrl ? (
                      <div className="relative">
                        <img src={coverUrl} alt="banner" className="w-full aspect-[16/6] object-cover block" />
                        <button
                          type="button"
                          onClick={() => setCoverUrl('')}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                          aria-label="移除封面"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-full aspect-[16/6] bg-muted/50 flex items-center justify-center text-xs text-muted-foreground gap-2">
                        <ImageIcon className="w-5 h-5" /> 尚未添加 Banner
                      </div>
                    )}
                    <div className="p-4">
                      <h2 className="text-base font-bold mb-2">{title || '（未命名标题）'}</h2>
                      {body ? (
                        editingBody ? (
                          <Textarea
                            ref={bodyRef}
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            rows={12}
                            className="text-sm font-mono"
                            onBlur={() => setEditingBody(false)}
                          />
                        ) : (
                          <div
                            onClick={() => setEditingBody(true)}
                            className="cursor-text hover:bg-muted/40 rounded p-1 -m-1"
                            title="点击编辑正文"
                          >
                            <MarkdownArticle content={body} />
                          </div>
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground">回到「对话」让 AI 帮你写正文</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 工具栏 */}
                <div className="px-4 py-2 shrink-0 border-t border-border/50 flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs bg-muted hover:bg-muted/70 cursor-pointer">
                    {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    上传 Banner
                    <input
                      type="file" accept="image/*" className="hidden"
                      disabled={uploadingCover}
                      onChange={e => { pickCoverFile(e.target.files?.[0] || null); e.currentTarget.value = ''; }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={generateBannerByAI}
                    disabled={genBannerBusy}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                  >
                    {genBannerBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI 画封面
                  </button>
                  <label className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs bg-muted hover:bg-muted/70 cursor-pointer">
                    {insertingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                    插图
                    <input
                      type="file" accept="image/*" className="hidden"
                      disabled={insertingImg}
                      onChange={e => { const f = e.target.files?.[0]; if (f) void insertBodyImage(f); e.currentTarget.value = ''; }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditingBody(v => !v)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs bg-muted hover:bg-muted/70"
                  >
                    <Pencil className="w-3.5 h-3.5" />{editingBody ? '完成' : '手改'}
                  </button>
                  <div className="flex-1" />
                  <Button size="sm" onClick={publish} disabled={submitting || !title.trim() || !body.trim()} className="h-8">
                    {submitting && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}发布
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>


      {/* Banner 裁剪器 */}
      <NotificationBannerCropper
        open={!!cropSrc}
        imageSrc={cropSrc}
        aspect={16 / 6}
        onCancel={() => setCropSrc(null)}
        onConfirm={applyCroppedBanner}
      />
    </div>
  );
}

/* ---------- 消息 Tab：店员列表 ---------- */
function StaffMessagesList({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<StaffPeer[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      // 找出用户所在门店
      const { data: myStaff } = await supabase
        .from('staff_profiles')
        .select('shop_id')
        .eq('user_id', userId)
        .maybeSingle();
      const shopId = (myStaff as any)?.shop_id as string | undefined;

      // 拉同店员工
      let coworkerIds: string[] = [];
      if (shopId) {
        const { data } = await supabase
          .from('staff_profiles')
          .select('user_id')
          .eq('shop_id', shopId);
        coworkerIds = ((data as any[]) || []).map(r => r.user_id).filter(id => id && id !== userId);
      }
      // 也把最近 30 天有过 DM 往来的人纳入
      const { data: recent } = await supabase
        .from('direct_messages')
        .select('sender_id, receiver_id, body, image_url, created_at, read_at')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(200);
      const lastByPeer = new Map<string, { text: string; at: string; unread: number }>();
      for (const m of (recent as any[]) || []) {
        const peerId = m.sender_id === userId ? m.receiver_id : m.sender_id;
        if (!peerId) continue;
        const text = m.body ? m.body : (m.image_url ? '[图片]' : '');
        const cur = lastByPeer.get(peerId);
        if (!cur) lastByPeer.set(peerId, { text, at: m.created_at, unread: 0 });
        if (m.receiver_id === userId && !m.read_at) {
          const e = lastByPeer.get(peerId)!;
          e.unread += 1;
        }
      }
      const allIds = Array.from(new Set([...coworkerIds, ...lastByPeer.keys()]));
      let profiles: any[] = [];
      if (allIds.length) {
        const { data } = await supabase.from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', allIds);
        profiles = (data as any[]) || [];
      }
      const list: StaffPeer[] = profiles.map(p => {
        const l = lastByPeer.get(p.user_id);
        return {
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          last_message: l?.text || null,
          last_at: l?.at || null,
          unread: l?.unread || 0,
        };
      });
      // 有 DM 的排前面，其余按名字排
      list.sort((a, b) => {
        if (!!a.last_at !== !!b.last_at) return a.last_at ? -1 : 1;
        if (a.last_at && b.last_at) return b.last_at.localeCompare(a.last_at);
        return (a.display_name || '').localeCompare(b.display_name || '');
      });
      if (!cancelled) { setPeers(list); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Realtime — 有新 DM 时刷新一次
  useEffect(() => {
    const ch = supabase.channel('rt-dm-list-' + userId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `receiver_id=eq.${userId}`,
      }, () => {
        // 让下一次 useEffect 重新计算：简单做法直接重新拉一次
        // 这里把 loading 置为 true 触发 effect 的 dep 不方便，直接内联再拉
        void supabase.from('direct_messages')
          .select('sender_id, receiver_id, body, image_url, created_at, read_at')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .then(({ data }) => {
            const m = (data as any[])?.[0];
            if (!m) return;
            const peerId = m.sender_id === userId ? m.receiver_id : m.sender_id;
            setPeers(prev => prev.map(p => p.user_id === peerId ? {
              ...p,
              last_message: m.body ? m.body : (m.image_url ? '[图片]' : p.last_message),
              last_at: m.created_at,
              unread: (p.unread || 0) + (m.receiver_id === userId && !m.read_at ? 1 : 0),
            } : p));
          });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (peers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">暂无同事，管理员可在后台添加员工</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-background overflow-hidden divide-y divide-border/60">
      {peers.map(p => (
        <Link
          key={p.user_id}
          to={`/messages/${p.user_id}`}
          className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40 active:bg-muted transition-colors"
        >
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold">
              {(p.display_name || '同').slice(0, 1)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold truncate">{p.display_name || '同事'}</p>
              {p.last_at && (
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(p.last_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {p.last_message || '点击开始聊天'}
            </p>
          </div>
          {p.unread ? (
            <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {p.unread > 99 ? '99+' : p.unread}
            </span>
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </Link>
      ))}
    </div>
  );
}

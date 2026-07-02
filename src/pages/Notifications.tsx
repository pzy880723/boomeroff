import { useEffect, useState } from 'react';
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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bell, Plus, CheckCheck, Loader2 } from 'lucide-react';

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  announcement: { label: '公告', tone: 'bg-primary/10 text-primary' },
  policy: { label: '制度', tone: 'bg-foreground/10 text-foreground' },
  activity: { label: '活动', tone: 'bg-accent/50 text-accent-foreground' },
  urgent: { label: '紧急', tone: 'bg-destructive/10 text-destructive' },
};

function typeMeta(t: string) {
  return TYPE_LABEL[t] ?? { label: t || '通知', tone: 'bg-muted text-muted-foreground' };
}

export default function Notifications() {
  const { user, role, loading: authLoading } = useAuth();
  const { items, loading, unreadCount, markRead, markAllRead, refresh } = useNotifications();
  const isAdmin = role === 'admin';

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('announcement');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('rt-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        void refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, refresh]);

  const publish = async () => {
    if (!title.trim() || !body.trim()) { toast.error('标题和内容不能为空'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('notifications' as any).insert({
      title: title.trim(),
      body: body.trim(),
      type,
      active: true,
      created_by: user!.id,
    });
    setSubmitting(false);
    if (error) { toast.error('发布失败:' + error.message); return; }
    toast.success('通知已发布');
    setTitle(''); setBody(''); setType('announcement');
    setOpen(false);
    void refresh();
  };

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="通知"
        right={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button size="sm" variant="ghost" onClick={markAllRead}>
                <CheckCheck className="w-4 h-4 mr-1" />全部已读
              </Button>
            )}
            {isAdmin && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="shadow-hard">
                    <Plus className="w-4 h-4 mr-1" />发通知
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>发布通知</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">类型</label>
                      <Select value={type} onValueChange={setType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="announcement">公告</SelectItem>
                          <SelectItem value="policy">制度</SelectItem>
                          <SelectItem value="activity">活动</SelectItem>
                          <SelectItem value="urgent">紧急</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">标题</label>
                      <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="简明扼要的标题" maxLength={60} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">内容</label>
                      <Textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="通知正文..." maxLength={2000} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
                    <Button onClick={publish} disabled={submitting}>
                      {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}发布
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
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
    </div>
  );
}

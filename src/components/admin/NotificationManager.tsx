import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';

interface Item {
  id: string;
  title: string;
  body: string;
  type: string;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export function NotificationManager() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ title: '', body: '', expires_at: '', active: true });

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('notifications')
      .select('*').order('created_at', { ascending: false }).limit(50);
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', body: '', expires_at: '', active: true });
    setOpen(true);
  };
  const openEdit = (it: Item) => {
    setEditing(it);
    setForm({
      title: it.title,
      body: it.body,
      expires_at: it.expires_at ? it.expires_at.slice(0, 10) : '',
      active: it.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('请填写标题'); return; }
    const payload: any = {
      title: form.title.trim(),
      body: form.body.trim(),
      type: 'announcement',
      active: form.active,
      expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59+08:00').toISOString() : null,
    };
    if (editing) {
      const { error } = await (supabase as any).from('notifications').update(payload).eq('id', editing.id);
      if (error) { toast.error('保存失败'); return; }
      toast.success('已更新');
    } else {
      const { error } = await (supabase as any).from('notifications').insert({ ...payload, created_by: user?.id });
      if (error) { toast.error('发布失败:' + error.message); return; }
      toast.success('已发布');
    }
    setOpen(false);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm('确认删除该通知?')) return;
    const { error } = await (supabase as any).from('notifications').delete().eq('id', id);
    if (error) { toast.error('删除失败'); return; }
    setItems(prev => prev.filter(i => i.id !== id));
    toast.success('已删除');
  };

  const toggleActive = async (it: Item) => {
    const { error } = await (supabase as any).from('notifications').update({ active: !it.active }).eq('id', it.id);
    if (error) { toast.error('操作失败'); return; }
    setItems(prev => prev.map(i => i.id === it.id ? { ...i, active: !it.active } : i));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" /> 系统通知
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">店员登录后会在仪表盘顶部看到</p>
        </div>
        <Button onClick={openNew} size="sm"><Plus className="w-4 h-4 mr-1" />新建通知</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">加载中…</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">暂无通知,点击"新建通知"发布第一条</Card>
      ) : (
        <div className="space-y-2">
          {items.map(it => {
            const expired = it.expires_at && new Date(it.expires_at) < new Date();
            return (
              <Card key={it.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{it.title}</span>
                      {!it.active && <Badge variant="secondary" className="text-[10px]">已下架</Badge>}
                      {expired && <Badge variant="outline" className="text-[10px]">已过期</Badge>}
                    </div>
                    {it.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{it.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {new Date(it.created_at).toLocaleString('zh-CN')}
                      {it.expires_at && ` · 有效至 ${new Date(it.expires_at).toLocaleDateString('zh-CN')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={it.active} onCheckedChange={() => toggleActive(it)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(it)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(it.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? '编辑通知' : '新建通知'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">标题</label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} maxLength={60} placeholder="例如:新品到货提醒" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">正文</label>
              <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={4} maxLength={500} placeholder="详细说明…" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">有效期(留空则永久)</label>
              <Input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">启用</label>
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save}>{editing ? '保存' : '发布'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

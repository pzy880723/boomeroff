import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Loader2, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VoucherType } from '@/lib/voucher';

export function VoucherTypeManager() {
  const [list, setList] = useState<VoucherType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<VoucherType> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('voucher_types')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    setList((data || []) as VoucherType[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim()) { toast.error('请填写名称'); return; }
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      description: editing.description || null,
      face_value: Number(editing.face_value) || 0,
      valid_days: Number(editing.valid_days) || 30,
      terms: editing.terms || null,
      active: editing.active ?? true,
      sort_order: Number(editing.sort_order) || 0,
    };
    const { error } = editing.id
      ? await supabase.from('voucher_types').update(payload).eq('id', editing.id)
      : await supabase.from('voucher_types').insert(payload as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('已保存');
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('删除该券类型？已发出的券不会受影响')) return;
    const { error } = await supabase.from('voucher_types').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('已删除'); load(); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">券类型</h2>
        <Button size="sm" onClick={() => setEditing({ active: true, valid_days: 30, face_value: 0 })}>
          <Plus className="w-4 h-4 mr-1" /> 新建
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">还没有券类型</Card>
      ) : (
        <div className="space-y-2">
          {list.map((t) => (
            <Card key={t.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{t.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">¥{Number(t.face_value).toFixed(0)} · {t.valid_days}天</span>
                  {!t.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">停用</span>}
                </div>
                {t.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEditing(t)}><Edit2 className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing?.id ? '编辑券类型' : '新建券类型'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label className="text-xs">名称</Label>
                <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label className="text-xs">描述（可选）</Label>
                <Textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">面额(¥)</Label>
                  <Input type="number" value={editing.face_value ?? 0} onChange={(e) => setEditing({ ...editing, face_value: Number(e.target.value) })} /></div>
                <div><Label className="text-xs">有效天数</Label>
                  <Input type="number" value={editing.valid_days ?? 30} onChange={(e) => setEditing({ ...editing, valid_days: Number(e.target.value) })} /></div>
              </div>
              <div><Label className="text-xs">使用条款</Label>
                <Textarea rows={2} value={editing.terms || ''} onChange={(e) => setEditing({ ...editing, terms: e.target.value })} /></div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">启用</Label>
                <Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Store } from 'lucide-react';
import { toast } from 'sonner';

interface Shop {
  id: string; name: string; address: string | null;
  sort_order: number; active: boolean;
}

export function ShopManager() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Shop> | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.from('shops' as any).select('*').order('sort_order').order('created_at');
    setShops((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!editing?.name?.trim()) { toast.error('请填写门店名称'); return; }
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      address: editing.address?.trim() || null,
      sort_order: editing.sort_order ?? 0,
      active: editing.active ?? true,
    };
    const { error } = editing.id
      ? await supabase.from('shops' as any).update(payload).eq('id', editing.id)
      : await supabase.from('shops' as any).insert(payload);
    setSaving(false);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('已保存');
    setEditing(null);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-1.5"><Store className="w-4 h-4" />门店列表</h2>
        <Button size="sm" onClick={() => setEditing({ active: true, sort_order: shops.length })}>
          <Plus className="w-4 h-4 mr-1" />新增门店
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : shops.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">还没有门店，点击"新增门店"创建</Card>
      ) : (
        <div className="space-y-2">
          {shops.map(s => (
            <Card key={s.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  {!s.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">已停用</span>}
                </div>
                {s.address && <p className="text-xs text-muted-foreground truncate">{s.address}</p>}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">#{s.sort_order}</span>
              <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? '编辑门店' : '新增门店'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>门店名称 *</Label>
                <Input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如：上海徐汇店" />
              </div>
              <div className="space-y-1.5">
                <Label>地址</Label>
                <Input value={editing.address || ''} onChange={e => setEditing({ ...editing, address: e.target.value })} placeholder="可选" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>排序</Label>
                  <Input type="number" value={editing.sort_order ?? 0} onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>启用</Label>
                  <div className="flex items-center h-10"><Switch checked={editing.active ?? true} onCheckedChange={v => setEditing({ ...editing, active: v })} /></div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

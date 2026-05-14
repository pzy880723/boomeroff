import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface Shift { id?: string; code: string; name: string; start_time: string; end_time: string; color: string; sort_order: number; active: boolean }
interface Holiday { id?: string; date: string; name: string; full_staff_off: boolean; intern_works: boolean }

const EMPTY_SHIFT: Shift = { code: '', name: '', start_time: '10:00', end_time: '19:00', color: '#f59e0b', sort_order: 99, active: true };
const EMPTY_HOL: Holiday = { date: '', name: '', full_staff_off: true, intern_works: true };

export function ShiftSettingsPanel() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [hols, setHols] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftDraft, setShiftDraft] = useState<Shift | null>(null);
  const [holDraft, setHolDraft] = useState<Holiday | null>(null);

  const refresh = async () => {
    setLoading(true);
    const [{ data: s }, { data: h }] = await Promise.all([
      supabase.from('shop_shifts' as any).select('*').order('sort_order'),
      supabase.from('shop_holidays' as any).select('*').order('date'),
    ]);
    setShifts((s as any) || []);
    setHols((h as any) || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const saveShift = async () => {
    if (!shiftDraft) return;
    const { id, ...payload } = shiftDraft;
    const { error } = id
      ? await supabase.from('shop_shifts' as any).update(payload).eq('id', id)
      : await supabase.from('shop_shifts' as any).insert(payload);
    if (error) { toast.error('保存失败：' + error.message); return; }
    toast.success('已保存');
    setShiftDraft(null);
    refresh();
  };

  const delShift = async (id: string) => {
    if (!confirm('确认删除该班次？')) return;
    const { error } = await supabase.from('shop_shifts' as any).delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('已删除'); refresh(); }
  };

  const saveHol = async () => {
    if (!holDraft || !holDraft.date) return;
    const { id, ...payload } = holDraft;
    const { error } = id
      ? await supabase.from('shop_holidays' as any).update(payload).eq('id', id)
      : await supabase.from('shop_holidays' as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('已保存'); setHolDraft(null); refresh();
  };

  const delHol = async (id: string) => {
    if (!confirm('确认删除？')) return;
    await supabase.from('shop_holidays' as any).delete().eq('id', id);
    refresh();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">班次设置</h3>
          <Button size="sm" onClick={() => setShiftDraft({ ...EMPTY_SHIFT })}><Plus className="w-4 h-4 mr-1" />新增班次</Button>
        </div>
        <div className="grid gap-2">
          {shifts.map(s => (
            <Card key={s.id} className="p-3 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ background: s.color }}>{s.code}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.name} <span className="text-xs text-muted-foreground tabular-nums ml-2">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</span></p>
                <p className="text-xs text-muted-foreground">{s.active ? '启用中' : '已停用'}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShiftDraft(s)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => s.id && delShift(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">节假日 / 特殊日期</h3>
          <Button size="sm" onClick={() => setHolDraft({ ...EMPTY_HOL })}><Plus className="w-4 h-4 mr-1" />新增</Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">勾选「正式员工不上班」时 AI 排班将跳过正式员工；「实习生上班」决定实习生是否仍然排班。</p>
        <div className="grid gap-2">
          {hols.length === 0 && <p className="text-sm text-muted-foreground">暂无</p>}
          {hols.map(h => (
            <Card key={h.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{h.date} · {h.name}</p>
                <p className="text-xs text-muted-foreground">
                  正式员工：{h.full_staff_off ? '休' : '正常'} · 实习生：{h.intern_works ? '上班' : '休'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setHolDraft(h)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => h.id && delHol(h.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </Card>
          ))}
        </div>
      </section>

      {/* shift dialog */}
      <Dialog open={!!shiftDraft} onOpenChange={(o) => !o && setShiftDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{shiftDraft?.id ? '编辑' : '新增'}班次</DialogTitle></DialogHeader>
          {shiftDraft && (
            <div className="space-y-3">
              <div><Label>代号 (如 A/B/C)</Label><Input value={shiftDraft.code} onChange={e => setShiftDraft({ ...shiftDraft, code: e.target.value.toUpperCase() })} maxLength={4} /></div>
              <div><Label>名称</Label><Input value={shiftDraft.name} onChange={e => setShiftDraft({ ...shiftDraft, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>开始时间</Label><Input type="time" value={shiftDraft.start_time} onChange={e => setShiftDraft({ ...shiftDraft, start_time: e.target.value })} /></div>
                <div><Label>结束时间</Label><Input type="time" value={shiftDraft.end_time} onChange={e => setShiftDraft({ ...shiftDraft, end_time: e.target.value })} /></div>
              </div>
              <div><Label>颜色</Label><Input type="color" value={shiftDraft.color} onChange={e => setShiftDraft({ ...shiftDraft, color: e.target.value })} className="h-10 w-20 p-1" /></div>
              <div className="flex items-center justify-between"><Label>启用</Label><Switch checked={shiftDraft.active} onCheckedChange={v => setShiftDraft({ ...shiftDraft, active: v })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftDraft(null)}>取消</Button>
            <Button onClick={saveShift}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* holiday dialog */}
      <Dialog open={!!holDraft} onOpenChange={(o) => !o && setHolDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{holDraft?.id ? '编辑' : '新增'}节假日</DialogTitle></DialogHeader>
          {holDraft && (
            <div className="space-y-3">
              <div><Label>日期</Label><Input type="date" value={holDraft.date} onChange={e => setHolDraft({ ...holDraft, date: e.target.value })} /></div>
              <div><Label>名称</Label><Input value={holDraft.name} onChange={e => setHolDraft({ ...holDraft, name: e.target.value })} placeholder="如：国庆节" /></div>
              <div className="flex items-center justify-between"><Label>正式员工不上班</Label><Switch checked={holDraft.full_staff_off} onCheckedChange={v => setHolDraft({ ...holDraft, full_staff_off: v })} /></div>
              <div className="flex items-center justify-between"><Label>实习生照常上班</Label><Switch checked={holDraft.intern_works} onCheckedChange={v => setHolDraft({ ...holDraft, intern_works: v })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHolDraft(null)}>取消</Button>
            <Button onClick={saveHol}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

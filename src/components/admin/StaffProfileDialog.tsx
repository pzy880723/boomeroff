import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { POSITION_LABELS, POSITION_ORDER, type StaffPosition } from '@/types';

interface Shift { code: string; name: string }
interface Shop { id: string; name: string }
interface DayOff { id?: string; off_date: string; reason?: string | null; shop_id?: string | null }

interface Profile {
  user_id: string;
  employment_type: 'regular' | 'intern';
  weekly_workdays: number;
  available_weekdays: number[];
  preferred_shifts: string[];
  blocked_shifts: string[];
  blocked_weekdays: number[];
  allowed_shop_ids: string[];
  max_per_week: number;
  note?: string | null;
  real_name?: string | null;
  position?: StaffPosition | null;
  shop_id?: string | null;
}

const WEEK = [
  { v: 1, l: '一' }, { v: 2, l: '二' }, { v: 3, l: '三' },
  { v: 4, l: '四' }, { v: 5, l: '五' }, { v: 6, l: '六' }, { v: 0, l: '日' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  displayName: string;
  shifts: Shift[];
  onSaved?: () => void;
}

export function StaffProfileDialog({ open, onOpenChange, userId, displayName, shifts, onSaved }: Props) {
  const [p, setP] = useState<Profile | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [newOff, setNewOff] = useState<DayOff>({ off_date: '', reason: '', shop_id: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data }, { data: shopRows }, { data: offRows }] = await Promise.all([
        supabase.from('staff_profiles' as any).select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('shops' as any).select('id, name').eq('active', true).order('sort_order').order('name'),
        supabase.from('staff_day_offs' as any).select('*').eq('user_id', userId).gte('off_date', new Date().toISOString().slice(0,10)).order('off_date'),
      ]);
      setShops((shopRows as any) || []);
      setDayOffs((offRows as any) || []);
      const d: any = data || {};
      setP({
        user_id: userId,
        employment_type: d.employment_type || 'regular',
        weekly_workdays: d.weekly_workdays ?? 5,
        available_weekdays: d.available_weekdays || [1,2,3,4,5,6,0],
        preferred_shifts: d.preferred_shifts || [],
        blocked_shifts: d.blocked_shifts || [],
        blocked_weekdays: d.blocked_weekdays || [],
        allowed_shop_ids: d.allowed_shop_ids || [],
        max_per_week: d.max_per_week ?? 5,
        note: d.note ?? null,
        real_name: d.real_name ?? null,
        position: d.position ?? null,
        shop_id: d.shop_id ?? null,
      });
      setLoading(false);
    })();
  }, [open, userId]);

  const toggle = (key: 'available_weekdays' | 'blocked_weekdays' | 'preferred_shifts' | 'blocked_shifts' | 'allowed_shop_ids', val: any) => {
    if (!p) return;
    const arr = (p as any)[key] as any[];
    const has = arr.includes(val);
    setP({ ...p, [key]: has ? arr.filter(x => x !== val) : [...arr, val] } as Profile);
  };

  const save = async () => {
    if (!p) return;
    const payload = { ...p, real_name: p.real_name?.trim() || null };
    const { error } = await supabase.from('staff_profiles' as any).upsert(payload);
    if (error) toast.error(error.message);
    else { toast.success('已保存'); onOpenChange(false); onSaved?.(); }
  };

  const addDayOff = async () => {
    if (!newOff.off_date) { toast.error('请选择日期'); return; }
    const { data, error } = await supabase.from('staff_day_offs' as any).insert({
      user_id: userId,
      off_date: newOff.off_date,
      reason: newOff.reason?.trim() || null,
      shop_id: newOff.shop_id || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setDayOffs([...dayOffs, data as any].sort((a, b) => a.off_date.localeCompare(b.off_date)));
    setNewOff({ off_date: '', reason: '', shop_id: null });
  };

  const delDayOff = async (id?: string) => {
    if (!id) return;
    await supabase.from('staff_day_offs' as any).delete().eq('id', id);
    setDayOffs(dayOffs.filter(d => d.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>员工资料 · {displayName}</DialogTitle></DialogHeader>
        {loading || !p ? <p className="text-sm text-muted-foreground">加载中…</p> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">真实姓名</Label>
                <Input value={p.real_name || ''} onChange={e => setP({ ...p, real_name: e.target.value })} placeholder="如：张三" />
              </div>
              <div>
                <Label className="text-xs">职位</Label>
                <Select value={p.position || ''} onValueChange={(v) => setP({ ...p, position: v as StaffPosition })}>
                  <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                  <SelectContent>
                    {POSITION_ORDER.map(k => (
                      <SelectItem key={k} value={k}>{POSITION_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">主门店</Label>
              <Select value={p.shop_id || ''} onValueChange={(v) => setP({ ...p, shop_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="请选择主门店" /></SelectTrigger>
                <SelectContent>
                  {shops.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">可上班门店（多选，留空=仅主门店）</Label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {shops.map(s => {
                  const on = p.allowed_shop_ids.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => toggle('allowed_shop_ids', s.id)}
                      className={cn('px-3 py-1.5 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">雇佣类型</Label>
              <div className="flex gap-2 mt-1">
                {(['regular','intern'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setP({ ...p, employment_type: t })}
                    className={cn('px-3 py-1.5 rounded-full text-xs border', p.employment_type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                    {t === 'regular' ? '正式员工' : '实习生'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">可上班的星期</Label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {WEEK.map(w => {
                  const on = p.available_weekdays.includes(w.v);
                  return (
                    <button key={w.v} type="button" onClick={() => toggle('available_weekdays', w.v)}
                      className={cn('w-9 h-9 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                      {w.l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">固定休息日（每周哪几天绝不排）</Label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {WEEK.map(w => {
                  const on = p.blocked_weekdays.includes(w.v);
                  return (
                    <button key={w.v} type="button" onClick={() => toggle('blocked_weekdays', w.v)}
                      className={cn('w-9 h-9 rounded-full text-xs border', on ? 'bg-destructive text-destructive-foreground border-destructive' : 'border-border')}>
                      {w.l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">偏好班次（可多选）</Label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {shifts.map(s => {
                  const on = p.preferred_shifts.includes(s.code);
                  return (
                    <button key={s.code} type="button" onClick={() => toggle('preferred_shifts', s.code)}
                      className={cn('px-3 py-1.5 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                      {s.code} · {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">不排班次（如不排晚班）</Label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {shifts.map(s => {
                  const on = p.blocked_shifts.includes(s.code);
                  return (
                    <button key={s.code} type="button" onClick={() => toggle('blocked_shifts', s.code)}
                      className={cn('px-3 py-1.5 rounded-full text-xs border', on ? 'bg-destructive text-destructive-foreground border-destructive' : 'border-border')}>
                      {s.code} · {s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">每周最多上班天数</Label>
                <Input type="number" min={0} max={7} value={p.max_per_week}
                  onChange={e => setP({ ...p, max_per_week: Math.max(0, Math.min(7, +e.target.value || 0)) })} />
              </div>
              <div>
                <Label className="text-xs">期望上班天数</Label>
                <Input type="number" min={0} max={7} value={p.weekly_workdays}
                  onChange={e => setP({ ...p, weekly_workdays: Math.max(0, Math.min(7, +e.target.value || 0)) })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">备注</Label>
              <Input value={p.note || ''} onChange={e => setP({ ...p, note: e.target.value })} placeholder="如：周三需要早走" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">禁排日期（请假/调休/培训等）</Label>
              <div className="space-y-1.5">
                {dayOffs.length === 0 && <p className="text-[11px] text-muted-foreground">暂无</p>}
                {dayOffs.map(d => {
                  const shop = shops.find(s => s.id === d.shop_id);
                  return (
                    <Card key={d.id} className="p-2 flex items-center gap-2">
                      <span className="text-xs font-medium tabular-nums">{d.off_date}</span>
                      <span className="text-[11px] text-muted-foreground flex-1 truncate">
                        {shop ? `仅 ${shop.name}` : '全部门店'}{d.reason ? ` · ${d.reason}` : ''}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => delDayOff(d.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </Card>
                  );
                })}
              </div>
              <div className="flex gap-1.5 items-end">
                <Input type="date" value={newOff.off_date} onChange={e => setNewOff({ ...newOff, off_date: e.target.value })} className="h-8 text-xs flex-1" />
                <Input value={newOff.reason || ''} onChange={e => setNewOff({ ...newOff, reason: e.target.value })} placeholder="原因" className="h-8 text-xs w-24" />
                <Select value={newOff.shop_id || 'all'} onValueChange={(v) => setNewOff({ ...newOff, shop_id: v === 'all' ? null : v })}>
                  <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部门店</SelectItem>
                    {shops.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addDayOff} className="h-8 px-2"><Plus className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

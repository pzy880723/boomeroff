import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Shift { code: string; name: string }

interface Profile {
  user_id: string;
  employment_type: 'regular' | 'intern';
  weekly_workdays: number;
  available_weekdays: number[];
  preferred_shifts: string[];
  max_per_week: number;
  note?: string | null;
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('staff_profiles' as any).select('*').eq('user_id', userId).maybeSingle();
      setP(((data as any) || {
        user_id: userId, employment_type: 'regular', weekly_workdays: 5,
        available_weekdays: [1,2,3,4,5,6,0], preferred_shifts: [], max_per_week: 5,
      }) as Profile);
      setLoading(false);
    })();
  }, [open, userId]);

  const toggleDay = (d: number) => {
    if (!p) return;
    const has = p.available_weekdays.includes(d);
    setP({ ...p, available_weekdays: has ? p.available_weekdays.filter(x => x !== d) : [...p.available_weekdays, d] });
  };
  const toggleShift = (c: string) => {
    if (!p) return;
    const has = p.preferred_shifts.includes(c);
    setP({ ...p, preferred_shifts: has ? p.preferred_shifts.filter(x => x !== c) : [...p.preferred_shifts, c] });
  };

  const save = async () => {
    if (!p) return;
    const { error } = await supabase.from('staff_profiles' as any).upsert(p);
    if (error) toast.error(error.message);
    else { toast.success('已保存'); onOpenChange(false); onSaved?.(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>排班设置 · {displayName}</DialogTitle></DialogHeader>
        {loading || !p ? <p className="text-sm text-muted-foreground">加载中…</p> : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">雇佣类型</Label>
              <div className="flex gap-2 mt-1">
                {(['regular','intern'] as const).map(t => (
                  <button key={t} onClick={() => setP({ ...p, employment_type: t })}
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
                    <button key={w.v} onClick={() => toggleDay(w.v)}
                      className={cn('w-9 h-9 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                      {w.l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">偏好班次（可多选，留空=不限）</Label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {shifts.map(s => {
                  const on = p.preferred_shifts.includes(s.code);
                  return (
                    <button key={s.code} onClick={() => toggleShift(s.code)}
                      className={cn('px-3 py-1.5 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
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

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Pencil, Store } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ShiftRow {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
  active: boolean;
  shop_id: string | null;
}
interface Shop { id: string; name: string }
interface Holiday { id?: string; date: string; name: string; full_staff_off: boolean; intern_works: boolean }

interface ShiftGroup {
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
  active: boolean;
  rows: ShiftRow[];
  shopIds: Set<string | null>; // null = 通配
}

interface ShiftDraft {
  originalCode: string | null; // null=新增；非空=编辑
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  sort_order: number;
  active: boolean;
  selectedShops: Set<string>; // 'ALL' = 通配
}

const ALL_SHOPS = 'ALL';
const EMPTY_HOL: Holiday = { date: '', name: '', full_staff_off: true, intern_works: true };

const newDraft = (): ShiftDraft => ({
  originalCode: null,
  code: '',
  name: '',
  start_time: '10:00',
  end_time: '19:00',
  color: '#f59e0b',
  sort_order: 99,
  active: true,
  selectedShops: new Set<string>(),
});

export function ShiftSettingsPanel() {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [hols, setHols] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [holDraft, setHolDraft] = useState<Holiday | null>(null);

  const refresh = async () => {
    setLoading(true);
    const [{ data: s }, { data: h }, { data: sh }] = await Promise.all([
      supabase.from('shop_shifts' as any).select('*').order('sort_order').order('code'),
      supabase.from('shop_holidays' as any).select('*').order('date'),
      supabase.from('shops' as any).select('id, name').eq('active', true).order('sort_order').order('name'),
    ]);
    setRows((s as any) || []);
    setHols((h as any) || []);
    setShops((sh as any) || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const groups: ShiftGroup[] = useMemo(() => {
    const map = new Map<string, ShiftGroup>();
    for (const r of rows) {
      const g = map.get(r.code);
      if (g) {
        g.rows.push(r);
        g.shopIds.add(r.shop_id);
      } else {
        map.set(r.code, {
          code: r.code,
          name: r.name,
          start_time: r.start_time,
          end_time: r.end_time,
          color: r.color || '#f59e0b',
          sort_order: r.sort_order,
          active: r.active,
          rows: [r],
          shopIds: new Set([r.shop_id]),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  }, [rows]);

  const openNew = () => setDraft(newDraft());

  const openEdit = (g: ShiftGroup) => {
    const sel = new Set<string>();
    g.shopIds.forEach(sid => sel.add(sid === null ? ALL_SHOPS : sid));
    setDraft({
      originalCode: g.code,
      code: g.code,
      name: g.name,
      start_time: g.start_time,
      end_time: g.end_time,
      color: g.color,
      sort_order: g.sort_order,
      active: g.active,
      selectedShops: sel,
    });
  };

  // 同 code 已被占用的 shop（用于新增模式禁用；编辑模式下排除自身组）
  const occupiedFor = (code: string, originalCode: string | null) => {
    const taken = new Set<string>();
    rows.forEach(r => {
      if (r.code !== code) return;
      if (originalCode === code) return; // 编辑当前组：自身行视为「可勾选/可取消」，不算占用
      taken.add(r.shop_id === null ? ALL_SHOPS : r.shop_id);
    });
    return taken;
  };

  const toggleShop = (key: string) => {
    if (!draft) return;
    const next = new Set(draft.selectedShops);
    if (next.has(key)) next.delete(key);
    else {
      if (key === ALL_SHOPS) {
        // 通配独占
        next.clear();
        next.add(ALL_SHOPS);
      } else {
        next.delete(ALL_SHOPS);
        next.add(key);
      }
    }
    setDraft({ ...draft, selectedShops: next });
  };

  const saveDraft = async () => {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase();
    if (!code) { toast.error('请填写班次代号'); return; }
    if (!draft.name.trim()) { toast.error('请填写班次名称'); return; }
    if (draft.selectedShops.size === 0) { toast.error('请至少选择一个适用门店'); return; }

    // 校验：新建时若 code 与他人冲突且与已选门店重叠 → 阻止
    const occupied = occupiedFor(code, draft.originalCode);
    for (const k of draft.selectedShops) {
      if (occupied.has(k)) {
        toast.error('所选门店已配置该代号班次，请取消勾选');
        return;
      }
    }

    const baseFields = {
      code,
      name: draft.name.trim(),
      start_time: draft.start_time,
      end_time: draft.end_time,
      color: draft.color,
      sort_order: draft.sort_order,
      active: draft.active,
    };

    // 编辑模式：先按原 code 同步基础字段；删除已取消勾选的 shop_id 行；新增勾选的行
    if (draft.originalCode) {
      const { error: e1 } = await supabase
        .from('shop_shifts' as any)
        .update(baseFields)
        .eq('code', draft.originalCode);
      if (e1) { toast.error('保存失败：' + e1.message); return; }

      const existing = rows.filter(r => r.code === draft.originalCode);
      const existingKeys = new Set(existing.map(r => r.shop_id === null ? ALL_SHOPS : r.shop_id));

      const toDelete = existing.filter(r => {
        const k = r.shop_id === null ? ALL_SHOPS : r.shop_id;
        return !draft.selectedShops.has(k);
      });
      const toInsert = Array.from(draft.selectedShops)
        .filter(k => !existingKeys.has(k))
        .map(k => ({
          ...baseFields,
          shop_id: k === ALL_SHOPS ? null : k,
        }));

      if (toDelete.length) {
        const { error } = await supabase
          .from('shop_shifts' as any)
          .delete()
          .in('id', toDelete.map(r => r.id));
        if (error) { toast.error('删除门店失败：' + error.message); return; }
      }
      if (toInsert.length) {
        const { error } = await supabase.from('shop_shifts' as any).insert(toInsert);
        if (error) { toast.error('新增门店失败：' + error.message); return; }
      }
    } else {
      // 新建：每个选中的门店插入一行
      const toInsert = Array.from(draft.selectedShops).map(k => ({
        ...baseFields,
        shop_id: k === ALL_SHOPS ? null : k,
      }));
      const { error } = await supabase.from('shop_shifts' as any).insert(toInsert);
      if (error) { toast.error('保存失败：' + error.message); return; }
    }

    toast.success('已保存');
    setDraft(null);
    refresh();
  };

  const delGroup = async (g: ShiftGroup) => {
    const shopNames = Array.from(g.shopIds).map(sid =>
      sid === null ? '全部门店' : (shops.find(s => s.id === sid)?.name || '未知门店')
    ).join('、');
    if (!confirm(`确认删除班次「${g.code} · ${g.name}」？\n将影响门店：${shopNames}`)) return;
    const { error } = await supabase.from('shop_shifts' as any).delete().eq('code', g.code);
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

  const draftOccupied = draft ? occupiedFor(draft.code.trim().toUpperCase(), draft.originalCode) : new Set<string>();

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">班次设置</h3>
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />新增班次</Button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">每个班次代号(A/B/C…)可同时适用多个门店；同一门店内代号唯一。</p>
        <div className="grid gap-2">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">暂无班次，点击右上角「新增班次」创建。</p>}
          {groups.map(g => (
            <Card key={g.code} className="p-3 flex items-start gap-3">
              <span className="w-8 h-8 rounded-full text-white text-xs flex items-center justify-center font-bold shrink-0" style={{ background: g.color }}>{g.code}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {g.name}
                  <span className="text-xs text-muted-foreground tabular-nums ml-2">{g.start_time.slice(0,5)}–{g.end_time.slice(0,5)}</span>
                  {!g.active && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">已停用</span>}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {Array.from(g.shopIds).map(sid => {
                    const isAll = sid === null;
                    const label = isAll ? '全部门店' : (shops.find(s => s.id === sid)?.name || '未知门店');
                    return (
                      <span key={String(sid)} className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 border',
                        isAll ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-foreground border-border',
                      )}>
                        <Store className="w-3 h-3" />{label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEdit(g)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => delGroup(g)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.originalCode ? '编辑' : '新增'}班次</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label>代号 (如 A/B/C)</Label>
                <Input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} maxLength={4} disabled={!!draft.originalCode} />
                {draft.originalCode && <p className="text-[11px] text-muted-foreground mt-1">编辑时不可修改代号</p>}
              </div>
              <div><Label>名称</Label><Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>开始时间</Label><Input type="time" value={draft.start_time} onChange={e => setDraft({ ...draft, start_time: e.target.value })} /></div>
                <div><Label>结束时间</Label><Input type="time" value={draft.end_time} onChange={e => setDraft({ ...draft, end_time: e.target.value })} /></div>
              </div>
              <div><Label>颜色</Label><Input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} className="h-10 w-20 p-1" /></div>
              <div className="flex items-center justify-between"><Label>启用</Label><Switch checked={draft.active} onCheckedChange={v => setDraft({ ...draft, active: v })} /></div>
              <div>
                <Label>适用门店</Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">已被该代号占用的门店不可勾选；选「全部门店」则与具体门店互斥。</p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const allTaken = draftOccupied.has(ALL_SHOPS);
                    const anySpecificSelected = Array.from(draft.selectedShops).some(k => k !== ALL_SHOPS);
                    const allSelected = draft.selectedShops.has(ALL_SHOPS);
                    const allDisabled = allTaken || anySpecificSelected;
                    return (
                      <button
                        type="button"
                        disabled={allDisabled}
                        onClick={() => toggleShop(ALL_SHOPS)}
                        className={cn(
                          'text-xs px-2 py-1 rounded border inline-flex items-center gap-1',
                          allSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border',
                          allDisabled && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <Store className="w-3 h-3" />全部门店（通配）
                        {allTaken && <span className="text-[10px]">·已配置</span>}
                      </button>
                    );
                  })()}
                  {shops.map(s => {
                    const taken = draftOccupied.has(s.id);
                    const allSelected = draft.selectedShops.has(ALL_SHOPS);
                    const checked = draft.selectedShops.has(s.id);
                    const disabled = taken || allSelected;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleShop(s.id)}
                        className={cn(
                          'text-xs px-2 py-1 rounded border inline-flex items-center gap-1',
                          checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border',
                          disabled && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <Store className="w-3 h-3" />{s.name}
                        {taken && <span className="text-[10px]">·已配置</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>取消</Button>
            <Button onClick={saveDraft}>保存</Button>
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

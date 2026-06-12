// 新建/编辑优惠券模板
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { VoucherTemplate } from '@/lib/voucher';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  voucher?: VoucherTemplate | null;
  onSaved?: (id: string) => void;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VoucherEditDialog({ open, onOpenChange, userId, voucher, onSaved }: Props) {
  const editing = !!voucher;
  const [name, setName] = useState('');
  const [thresholdType, setThresholdType] = useState<'none' | 'min_spend'>('none');
  const [discountAmount, setDiscountAmount] = useState<string>('10');
  const [minSpend, setMinSpend] = useState<string>('50');
  const [validDays, setValidDays] = useState<string>('30');
  const [terms, setTerms] = useState('');
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState<string>('');
  const [endsAt, setEndsAt] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (voucher) {
      setName(voucher.name || '');
      setThresholdType(voucher.threshold_type);
      setDiscountAmount(String(voucher.discount_amount ?? 0));
      setMinSpend(String(voucher.min_spend ?? ''));
      setValidDays(String(voucher.valid_days ?? 30));
      setTerms(voucher.template_terms || '');
      setActive(voucher.active);
      setStartsAt(voucher.starts_at ? toLocalInput(new Date(voucher.starts_at)) : '');
      setEndsAt(voucher.ends_at ? toLocalInput(new Date(voucher.ends_at)) : '');
    } else {
      setName(''); setThresholdType('none');
      setDiscountAmount('10'); setMinSpend('50'); setValidDays('30');
      setTerms(''); setActive(true);
      setStartsAt(toLocalInput(new Date()));
      setEndsAt('');
    }
  }, [open, voucher]);

  const save = async () => {
    if (!name.trim()) { toast.error('请输入名称'); return; }
    const da = Number(discountAmount);
    if (!isFinite(da) || da <= 0) { toast.error('请填写有效的抵扣金额'); return; }
    if (thresholdType === 'min_spend') {
      const ms = Number(minSpend);
      if (!isFinite(ms) || ms <= 0) { toast.error('请填写门槛金额'); return; }
      if (ms <= da) { toast.error('门槛金额需大于抵扣金额'); return; }
    }
    const vd = Number(validDays);
    if (!Number.isInteger(vd) || vd <= 0) { toast.error('请填写有效期天数'); return; }

    let startsIso: string | null = null;
    let endsIso: string | null = null;
    if (startsAt) {
      const d = new Date(startsAt);
      if (isNaN(d.getTime())) { toast.error('开始时间格式不正确'); return; }
      startsIso = d.toISOString();
    }
    if (endsAt) {
      const d = new Date(endsAt);
      if (isNaN(d.getTime())) { toast.error('结束时间格式不正确'); return; }
      endsIso = d.toISOString();
    }
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
      toast.error('结束时间必须晚于开始时间'); return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      threshold_type: thresholdType,
      discount_amount: da,
      min_spend: thresholdType === 'min_spend' ? Number(minSpend) : null,
      valid_days: vd,
      template_terms: terms.trim() || null,
      active,
      starts_at: startsIso,
      ends_at: endsIso,
    } as any;
    let result;
    if (editing && voucher) {
      result = await supabase.from('vouchers').update(payload).eq('id', voucher.id).select('id').maybeSingle();
    } else {
      result = await supabase.from('vouchers').insert({ ...payload, created_by: userId } as any).select('id').maybeSingle();
    }
    setSaving(false);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success(editing ? '已更新' : '已创建');
    onOpenChange(false);
    onSaved?.((result.data as any)?.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑优惠券' : '新建优惠券'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：小红书探店专属券" maxLength={50} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">类型</Label>
            <RadioGroup
              value={thresholdType}
              onValueChange={(v) => setThresholdType(v as 'none' | 'min_spend')}
              className="grid grid-cols-2 gap-2"
            >
              <label className={`border rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer ${thresholdType === 'none' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="none" id="t-none" />
                <span className="text-sm">无门槛</span>
              </label>
              <label className={`border rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer ${thresholdType === 'min_spend' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <RadioGroupItem value="min_spend" id="t-min" />
                <span className="text-sm">满减</span>
              </label>
            </RadioGroup>
          </div>

          {thresholdType === 'min_spend' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">消费满（元）</Label>
                <Input type="number" min={1} value={minSpend} onChange={(e) => setMinSpend(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">抵（元）</Label>
                <Input type="number" min={1} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">抵扣金额（元）</Label>
              <Input type="number" min={1} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">开始时间</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">结束时间（可选）</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            开始时间到结束时间之间可被领取；到期时间取「领取后 N 天」与结束时间中较早者。
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">领取后有效期（天）</Label>
            <Input type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">使用说明（可选）</Label>
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={300} rows={2} placeholder="如：仅限到店消费，不与其他优惠同享" />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs">启用</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

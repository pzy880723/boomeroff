// 新建/编辑活动：名称、描述、选抵用券、自定义字段、状态
import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Activity, ActivityField, VoucherTemplate } from '@/lib/voucher';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  activityId?: string | null;
  onSaved?: () => void;
}

const FIELD_TYPES: Array<{ value: ActivityField['type']; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'phone', label: '手机号' },
  { value: 'url', label: '网址' },
  { value: 'image', label: '图片' },
  { value: 'textarea', label: '多行文本' },
];

const DEFAULT_FIELDS: ActivityField[] = [
  { key: 'screenshot', label: '主页截图', type: 'image', required: true },
];

export function ActivityEditDialog({ open, onOpenChange, userId, activityId, onSaved }: Props) {
  const isEdit = !!activityId;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voucherId, setVoucherId] = useState('');
  const [vouchers, setVouchers] = useState<VoucherTemplate[]>([]);
  const [fields, setFields] = useState<ActivityField[]>(DEFAULT_FIELDS);
  const [active, setActive] = useState(true);
  const [requiresReview, setRequiresReview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('vouchers')
        .select('*')
        .eq('active', true)
        .not('name', 'is', null)
        .order('created_at', { ascending: false });
      setVouchers((data || []) as unknown as VoucherTemplate[]);
    })();

    if (activityId) {
      setLoadingDetail(true);
      (async () => {
        const { data } = await supabase
          .from('activities')
          .select('*')
          .eq('id', activityId)
          .maybeSingle();
        const a = data as unknown as Activity | null;
        if (a) {
          setName(a.name);
          setDescription(a.description || '');
          setVoucherId(a.voucher_id);
          setFields((a.form_fields && a.form_fields.length ? a.form_fields : DEFAULT_FIELDS) as ActivityField[]);
          setActive(a.status !== 'closed');
          setRequiresReview(a.requires_review !== false);
        }
        setLoadingDetail(false);
      })();
    } else {
      setName(''); setDescription(''); setVoucherId('');
      setFields(DEFAULT_FIELDS);
      setActive(true);
      setRequiresReview(true);
    }
  }, [open, activityId]);

  const addField = () => {
    setFields((f) => [
      ...f,
      { key: `field_${Date.now()}_${f.length}`, label: '新字段', type: 'text', required: false },
    ]);
  };
  const updateField = (i: number, patch: Partial<ActivityField>) => {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };
  const removeField = (i: number) => setFields((f) => f.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { toast.error('请输入活动名称'); return; }
    if (!voucherId) { toast.error('请选择关联的抵用券'); return; }
    for (const f of fields) {
      if (!f.label?.trim()) { toast.error('填写内容的标题不能为空'); return; }
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      voucher_id: voucherId,
      form_fields: fields as any,
      status: active ? 'active' : 'draft',
      requires_review: requiresReview,
    };
    let error;
    if (isEdit && activityId) {
      ({ error } = await supabase.from('activities').update(payload).eq('id', activityId));
    } else {
      ({ error } = await supabase.from('activities').insert({ ...payload, created_by: userId } as any));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? '已保存' : '已创建');
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? '编辑活动' : '新建活动'}</DialogTitle></DialogHeader>
        {loadingDetail ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">活动名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="如：小红书探店活动" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">活动描述（可选）</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">关联抵用券</Label>
            <Select value={voucherId} onValueChange={setVoucherId}>
              <SelectTrigger><SelectValue placeholder="选择一张抵用券" /></SelectTrigger>
              <SelectContent>
                {vouchers.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} · ¥{v.discount_amount}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">领取方式</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRequiresReview(true)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition',
                  requiresReview ? 'border-primary bg-primary/5' : 'border-border'
                )}
              >
                <p className="text-xs font-medium">需要审核</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">申请后由管理员审核，通过后短信通知</p>
              </button>
              <button
                type="button"
                onClick={() => setRequiresReview(false)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition',
                  !requiresReview ? 'border-primary bg-primary/5' : 'border-border'
                )}
              >
                <p className="text-xs font-medium">无需审核</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">分享页填写信息后直接领取抵用券</p>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">添加填写内容</Label>
              <Button size="sm" variant="outline" className="h-7" onClick={addField}>
                <Plus className="w-3 h-3 mr-1" />添加
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">姓名、手机号默认必填，无需自定义</p>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="border rounded-lg p-2 space-y-1.5">
                  <div className="flex gap-2 items-center">
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="填写内容标题"
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                    />
                    <Select value={f.type} onValueChange={(v) => updateField(i, { type: v as ActivityField['type'] })}>
                      <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => removeField(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-end">
                    <label className="flex items-center gap-1.5 text-[11px]">
                      <Switch checked={!!f.required} onCheckedChange={(v) => updateField(i, { required: v })} />
                      必填
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">立即上线</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving || loadingDetail}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}{isEdit ? '保存' : '创建活动'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

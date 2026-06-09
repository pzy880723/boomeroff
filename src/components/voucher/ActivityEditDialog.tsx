// 新建活动：名称、描述、选抵用券、自定义字段、状态
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
import type { ActivityField, VoucherTemplate } from '@/lib/voucher';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onSaved?: () => void;
}

const FIELD_TYPES: Array<{ value: ActivityField['type']; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'phone', label: '手机号' },
  { value: 'url', label: '网址' },
  { value: 'image', label: '图片' },
  { value: 'textarea', label: '多行文本' },
];

export function ActivityEditDialog({ open, onOpenChange, userId, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [voucherId, setVoucherId] = useState('');
  const [vouchers, setVouchers] = useState<VoucherTemplate[]>([]);
  const [fields, setFields] = useState<ActivityField[]>([
    { key: 'screenshot', label: '主页截图', type: 'image', required: true },
  ]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setName(''); setDescription(''); setVoucherId('');
    setFields([{ key: 'screenshot', label: '主页截图', type: 'image', required: true }]);
    setActive(true);
  }, [open]);

  const addField = () => {
    setFields((f) => [...f, { key: `field_${f.length + 1}`, label: '新字段', type: 'text', required: false }]);
  };
  const updateField = (i: number, patch: Partial<ActivityField>) => {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  };
  const removeField = (i: number) => setFields((f) => f.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) { toast.error('请输入活动名称'); return; }
    if (!voucherId) { toast.error('请选择关联的抵用券'); return; }
    for (const f of fields) {
      if (!f.key || !f.label) { toast.error('字段名/标题不能为空'); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('activities').insert({
      name: name.trim(),
      description: description.trim() || null,
      voucher_id: voucherId,
      form_fields: fields as any,
      status: active ? 'active' : 'draft',
      created_by: userId,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('已创建');
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>新建活动</DialogTitle></DialogHeader>
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
            <div className="flex items-center justify-between">
              <Label className="text-xs">申请字段</Label>
              <Button size="sm" variant="outline" className="h-7" onClick={addField}>
                <Plus className="w-3 h-3 mr-1" />添加字段
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">姓名、手机号默认必填，无需自定义</p>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="border rounded-lg p-2 space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="字段标题"
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                    />
                    <Select value={f.type} onValueChange={(v) => updateField(i, { type: v as ActivityField['type'] })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
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
                  <div className="flex items-center justify-between">
                    <Input
                      className="h-7 text-[11px] w-32"
                      placeholder="字段键(英文)"
                      value={f.key}
                      onChange={(e) => updateField(i, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                    />
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}创建活动
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

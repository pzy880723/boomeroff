import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VoucherType } from '@/lib/voucher';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: (voucherId: string) => void;
}

export function NewVoucherDialog({ open, onOpenChange, userId, onCreated }: Props) {
  const [types, setTypes] = useState<VoucherType[]>([]);
  const [typeId, setTypeId] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('voucher_types')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      const list = (data || []) as VoucherType[];
      setTypes(list);
      setTypeId(list[0]?.id || '');
      setLoading(false);
    })();
  }, [open]);

  const submit = async () => {
    if (!typeId) {
      toast.error('请先选择券类型');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('vouchers')
      .insert({
        type_id: typeId,
        created_by: userId,
        note: note.trim() || null,
        code: '', // 由 DB trigger 自动生成短码
      } as any)
      .select('id')
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      toast.error(error?.message || '创建失败');
      return;
    }
    toast.success('已创建,快去转发给客户吧');
    onCreated(data.id);
    onOpenChange(false);
    setNote('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新建抵用券</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : types.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              暂无可用的券类型，请先联系管理员在后台创建
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">券类型</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择券类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · ¥{Number(t.face_value).toFixed(0)} · 有效 {t.valid_days} 天
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(() => {
                  const t = types.find((x) => x.id === typeId);
                  return t?.description ? (
                    <p className="text-[11px] text-muted-foreground">{t.description}</p>
                  ) : null;
                })()}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">备注（可选，仅自己可见）</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：小红书探店达人 @xxx"
                  rows={2}
                  maxLength={200}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={submit} disabled={saving || !typeId || types.length === 0}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            生成抵用券
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

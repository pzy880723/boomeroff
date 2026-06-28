import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { invokeFn } from '@/lib/invokeFn';

export interface KnowledgeRecord {
  id?: string;
  product_name: string;
  category: ProductCategory;
  era: string | null;
  origin: string | null;
  selling_points: string[];
  tips: string | null;
  image_url: string | null;
}

interface Props {
  record: KnowledgeRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function KnowledgeEditDialog({ record, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_name: '',
    category: 'other' as ProductCategory,
    era: '',
    origin: '',
    selling_points: '',
    tips: '',
    image_url: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        product_name: record?.product_name || '',
        category: record?.category || 'other',
        era: record?.era || '',
        origin: record?.origin || '',
        selling_points: (record?.selling_points || []).join('\n'),
        tips: record?.tips || '',
        image_url: record?.image_url || '',
      });
    }
  }, [record, open]);

  const handleSave = async () => {
    if (!form.product_name.trim()) {
      toast({ title: '请输入商品名称', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const sp = form.selling_points
        .split('\n').map((s) => s.trim()).filter(Boolean);

      // AI 自动判定品类（用 AI 判定结果覆盖手选，避免乱归类）
      let category: ProductCategory = form.category;
      try {
        const { data: catData } = await invokeFn('auto-categorize-knowledge', {
          body: {
            mode: 'single',
            name: form.product_name.trim(),
            era: form.era.trim(),
            origin: form.origin.trim(),
            selling_points: sp,
            tips: form.tips.trim(),
          },
        });
        if (catData?.category) category = catData.category as ProductCategory;
      } catch (e) {
        console.warn('auto categorize failed, fallback to form value', e);
      }

      const payload = {
        product_name: form.product_name.trim(),
        category,
        era: form.era.trim() || null,
        origin: form.origin.trim() || null,
        selling_points: sp,
        tips: form.tips.trim() || null,
        image_url: form.image_url.trim() || null,
      };

      if (record?.id) {
        const { error } = await supabase
          .from('product_knowledge')
          .update(payload)
          .eq('id', record.id);
        if (error) throw error;
        toast({ title: '已更新' });
      } else {
        const { error } = await supabase
          .from('product_knowledge')
          .insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast({ title: '已新增' });
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: '保存失败', description: '请检查权限或重试', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record?.id ? '编辑知识点' : '新增知识点'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>商品名称 *</Label>
            <Input value={form.product_name}
              onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>品类</Label>
            <Select value={form.category}
              onValueChange={(v) => setForm((p) => ({ ...p, category: v as ProductCategory }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>年代</Label>
              <Input value={form.era} placeholder="如：昭和"
                onChange={(e) => setForm((p) => ({ ...p, era: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>产地</Label>
              <Input value={form.origin} placeholder="如：京都"
                onChange={(e) => setForm((p) => ({ ...p, origin: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>核心卖点（每行一条）</Label>
            <Textarea rows={4} value={form.selling_points}
              onChange={(e) => setForm((p) => ({ ...p, selling_points: e.target.value }))}
              placeholder="例如：手工描金&#10;品相完好&#10;稀有款式" />
          </div>
          <div className="space-y-2">
            <Label>店员贴士</Label>
            <Textarea rows={2} value={form.tips}
              onChange={(e) => setForm((p) => ({ ...p, tips: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>图片地址</Label>
            <Input value={form.image_url} placeholder="https://..."
              onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

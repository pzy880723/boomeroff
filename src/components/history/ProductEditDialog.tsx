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

interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  era: string | null;
  origin?: string | null;
  material: string | null;
  craft: string | null;
  description: string | null;
  dimensions: string | null;
  condition: string | null;
  selling_points?: string[];
  tips?: string | null;
}

interface ProductEditDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function ProductEditDialog({ product, open, onOpenChange, onSave }: ProductEditDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'other' as ProductCategory,
    era: '',
    origin: '',
    material: '',
    craft: '',
    description: '',
    dimensions: '',
    condition: '',
    selling_points: '',
    tips: '',
  });

  useEffect(() => {
    if (product && open) {
      setFormData({
        name: product.name || '',
        category: product.category || 'other',
        era: product.era || '',
        origin: product.origin || '',
        material: product.material || '',
        craft: product.craft || '',
        description: product.description || '',
        dimensions: product.dimensions || '',
        condition: product.condition || '',
        selling_points: (product.selling_points || []).join('\n'),
        tips: product.tips || '',
      });
    }
  }, [product, open]);

  const handleSave = async () => {
    if (!product) return;
    if (!formData.name.trim()) {
      toast({ title: '请输入商品名称', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const sellingPointsArr = formData.selling_points
        .split('\n').map(s => s.trim()).filter(Boolean);

      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name.trim(),
          category: formData.category,
          era: formData.era.trim() || null,
          origin: formData.origin.trim() || null,
          material: formData.material.trim() || null,
          craft: formData.craft.trim() || null,
          description: formData.description.trim() || null,
          dimensions: formData.dimensions.trim() || null,
          condition: formData.condition.trim() || null,
          selling_points: sellingPointsArr,
          tips: formData.tips.trim() || null,
        })
        .eq('id', product.id);

      if (error) throw error;
      toast({ title: '保存成功' });
      onSave?.();
    } catch (error) {
      console.error('Error updating product:', error);
      toast({ title: '保存失败', description: '请重试', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑商品信息</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">商品名称 *</Label>
            <Input id="name" value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">类别</Label>
            <Select value={formData.category}
              onValueChange={(v) => setFormData(p => ({ ...p, category: v as ProductCategory }))}>
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
              <Label htmlFor="era">年代</Label>
              <Input id="era" value={formData.era}
                onChange={(e) => setFormData(p => ({ ...p, era: e.target.value }))}
                placeholder="如：昭和时期" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origin">产地</Label>
              <Input id="origin" value={formData.origin}
                onChange={(e) => setFormData(p => ({ ...p, origin: e.target.value }))}
                placeholder="如：日本京都" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="material">材质</Label>
              <Input id="material" value={formData.material}
                onChange={(e) => setFormData(p => ({ ...p, material: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="craft">工艺</Label>
              <Input id="craft" value={formData.craft}
                onChange={(e) => setFormData(p => ({ ...p, craft: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dimensions">尺寸</Label>
              <Input id="dimensions" value={formData.dimensions}
                onChange={(e) => setFormData(p => ({ ...p, dimensions: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="condition">品相</Label>
              <Input id="condition" value={formData.condition}
                onChange={(e) => setFormData(p => ({ ...p, condition: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="selling_points">核心卖点（每行一条）</Label>
            <Textarea id="selling_points" rows={4} value={formData.selling_points}
              onChange={(e) => setFormData(p => ({ ...p, selling_points: e.target.value }))}
              placeholder="例如：昭和经典款式&#10;手工描金工艺&#10;品相完好可日用" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">商品介绍</Label>
            <Textarea id="description" rows={4} value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tips">店员小贴士</Label>
            <Textarea id="tips" rows={2} value={formData.tips}
              onChange={(e) => setFormData(p => ({ ...p, tips: e.target.value }))}
              placeholder="保养、辨识真伪或文化背景..." />
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

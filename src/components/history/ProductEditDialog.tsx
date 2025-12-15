import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  material: string | null;
  craft: string | null;
  description: string | null;
  dimensions: string | null;
  condition: string | null;
}

interface ProductEditDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function ProductEditDialog({ 
  product, 
  open, 
  onOpenChange,
  onSave
}: ProductEditDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'other' as ProductCategory,
    era: '',
    material: '',
    craft: '',
    description: '',
    dimensions: '',
    condition: '',
  });

  useEffect(() => {
    if (product && open) {
      setFormData({
        name: product.name || '',
        category: product.category || 'other',
        era: product.era || '',
        material: product.material || '',
        craft: product.craft || '',
        description: product.description || '',
        dimensions: product.dimensions || '',
        condition: product.condition || '',
      });
    }
  }, [product, open]);

  const handleSave = async () => {
    if (!product) return;
    
    if (!formData.name.trim()) {
      toast({
        title: '请输入商品名称',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name.trim(),
          category: formData.category,
          era: formData.era.trim() || null,
          material: formData.material.trim() || null,
          craft: formData.craft.trim() || null,
          description: formData.description.trim() || null,
          dimensions: formData.dimensions.trim() || null,
          condition: formData.condition.trim() || null,
        })
        .eq('id', product.id);

      if (error) throw error;

      toast({ title: '保存成功' });
      onSave?.();
    } catch (error) {
      console.error('Error updating product:', error);
      toast({
        title: '保存失败',
        description: '请重试',
        variant: 'destructive',
      });
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
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="输入商品名称"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">类别</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as ProductCategory }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择类别" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="era">年代</Label>
              <Input
                id="era"
                value={formData.era}
                onChange={(e) => setFormData(prev => ({ ...prev, era: e.target.value }))}
                placeholder="如：昭和时期"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material">材质</Label>
              <Input
                id="material"
                value={formData.material}
                onChange={(e) => setFormData(prev => ({ ...prev, material: e.target.value }))}
                placeholder="如：陶瓷"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="craft">工艺</Label>
              <Input
                id="craft"
                value={formData.craft}
                onChange={(e) => setFormData(prev => ({ ...prev, craft: e.target.value }))}
                placeholder="如：手工描金"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dimensions">尺寸</Label>
              <Input
                id="dimensions"
                value={formData.dimensions}
                onChange={(e) => setFormData(prev => ({ ...prev, dimensions: e.target.value }))}
                placeholder="如：高10cm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition">状态</Label>
            <Input
              id="condition"
              value={formData.condition}
              onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value }))}
              placeholder="如：完好无损"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="商品详细描述..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

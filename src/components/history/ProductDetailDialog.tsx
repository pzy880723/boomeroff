import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Edit, Trash2, Calendar, Sparkles, Package, Info, Lightbulb,
} from 'lucide-react';
import { CATEGORY_LABELS, ProductCategory } from '@/types';
import type { Json } from '@/integrations/supabase/types';
import { ProductEditDialog } from './ProductEditDialog';
import { ShareToCommunityButton } from '@/components/community/ShareToCommunityButton';
import { normalizeSellingPoints, normalizeTips, SELLING_TAG_STYLE } from '@/lib/script';

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
  created_at: string;
  scripts?: Json | null;
  image_url: string | null;
  origin?: string | null;
  selling_points?: Json | null;
  tips?: string | null;
}

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductUpdate?: () => void;
  onProductDelete?: () => void;
}

export function ProductDetailDialog({
  product, open, onOpenChange, onProductUpdate, onProductDelete,
}: ProductDetailDialogProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = role === 'admin';

  const handleDelete = async () => {
    if (!product || !isAdmin) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
      toast({ title: '商品已删除' });
      onOpenChange(false);
      onProductDelete?.();
    } catch {
      toast({ title: '删除失败', description: '请重试', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  if (!product) return null;

  const sellingPoints = normalizeSellingPoints(product.selling_points);
  const tipsObj = normalizeTips(product.tips);
  const flatSellingTexts = sellingPoints.map(s => s.text);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{product.name}</DialogTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(product.created_at)}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="aspect-square max-w-xs mx-auto overflow-hidden rounded-lg bg-muted">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-16 h-16 text-muted-foreground/30" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge>{CATEGORY_LABELS[product.category] || product.category}</Badge>
              {product.era && <Badge variant="outline">{product.era}</Badge>}
              {product.origin && <Badge variant="outline">{product.origin}</Badge>}
              {product.material && <Badge variant="outline">{product.material}</Badge>}
              {product.craft && <Badge variant="outline">{product.craft}</Badge>}
            </div>

            {(product.dimensions || product.condition) && (
              <div className="text-sm text-muted-foreground space-y-1">
                {product.dimensions && <p>尺寸: {product.dimensions}</p>}
                {product.condition && <p>品相: {product.condition}</p>}
              </div>
            )}

            {sellingPoints.length > 0 && (
              <Card className="border-2 border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-primary text-base">
                    <Sparkles className="w-4 h-4" />
                    核心卖点
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {sellingPoints.map((p, i) => (
                      <li key={i} className="flex gap-2 leading-relaxed text-sm">
                        <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {product.description && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Info className="w-4 h-4" />
                    商品介绍
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{product.description}</p>
                </CardContent>
              </Card>
            )}

            {product.tips && (
              <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                    <Lightbulb className="w-4 h-4" />
                    店员小贴士
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{product.tips}</p>
                </CardContent>
              </Card>
            )}

            <div className="pt-2 border-t border-border/40">
              <ShareToCommunityButton
                productId={product.id}
                name={product.name}
                category={product.category}
                era={product.era}
                origin={product.origin}
                imageUrl={product.image_url}
                sellingPoints={sellingPoints}
                tips={product.tips}
                size="default"
                className="w-full rounded-full"
              />
            </div>

            {isAdmin && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}>
                  <Edit className="w-4 h-4 mr-1" />
                  编辑
                </Button>
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  删除
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ProductEditDialog
        product={product ? {
          id: product.id,
          name: product.name,
          category: product.category,
          era: product.era,
          origin: product.origin ?? null,
          material: product.material,
          craft: product.craft,
          description: product.description,
          dimensions: product.dimensions,
          condition: product.condition,
          selling_points: sellingPoints,
          tips: product.tips ?? null,
        } : null}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSave={() => {
          onProductUpdate?.();
          setEditDialogOpen(false);
        }}
      />
    </>
  );
}

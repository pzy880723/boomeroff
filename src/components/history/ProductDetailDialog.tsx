import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useSpeech } from '@/hooks/useSpeech';
import { 
  Copy, 
  Volume2,
  VolumeX,
  Edit, 
  Trash2, 
  Calendar,
  DollarSign,
  Sparkles,
  Package
} from 'lucide-react';
import { CATEGORY_LABELS, SCRIPT_STYLE_LABELS, ProductCategory, PriceRecord } from '@/types';
import type { Json } from '@/integrations/supabase/types';
import { ProductEditDialog } from './ProductEditDialog';

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
  scripts: Json | null;
  image_url: string | null;
}

interface ProductDetailDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductUpdate?: () => void;
  onProductDelete?: () => void;
}

export function ProductDetailDialog({ 
  product, 
  open, 
  onOpenChange,
  onProductUpdate,
  onProductDelete
}: ProductDetailDialogProps) {
  const { role } = useAuth();
  const { toast } = useToast();
  const { isSpeaking, speak, stop } = useSpeech();
  const [priceRecords, setPriceRecords] = useState<PriceRecord[]>([]);
  const [copiedStyle, setCopiedStyle] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (product && open) {
      fetchPriceRecords(product.id);
    }
  }, [product, open]);

  const fetchPriceRecords = async (productId: string) => {
    const { data, error } = await supabase
      .from('price_records')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPriceRecords(data as PriceRecord[]);
    }
  };

  const copyScript = async (text: string, style: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedStyle(style);
    setTimeout(() => setCopiedStyle(null), 2000);
    toast({ title: '已复制到剪贴板' });
  };

  const speakScript = (text: string) => {
    speak(text);
  };

  const handleDelete = async () => {
    if (!product || !isAdmin) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;

      toast({ title: '商品已删除' });
      onOpenChange(false);
      onProductDelete?.();
    } catch (error) {
      toast({
        title: '删除失败',
        description: '请重试',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!product) return null;

  const scripts = product.scripts as Record<string, string> | null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-xl">{product.name}</DialogTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {formatDate(product.created_at)}
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}>
                    <Edit className="w-4 h-4 mr-1" />
                    编辑
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* 商品图片 */}
            <div className="aspect-square max-w-xs mx-auto overflow-hidden rounded-lg bg-muted">
              {product.image_url ? (
                <img 
                  src={product.image_url} 
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-16 h-16 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* 基本信息 */}
            <div className="flex flex-wrap gap-2">
              <Badge>{CATEGORY_LABELS[product.category] || product.category}</Badge>
              {product.era && <Badge variant="outline">{product.era}</Badge>}
              {product.material && <Badge variant="outline">{product.material}</Badge>}
              {product.craft && <Badge variant="outline">{product.craft}</Badge>}
            </div>

            {/* 描述 */}
            {product.description && (
              <p className="text-muted-foreground">{product.description}</p>
            )}

            {/* 尺寸和状态 */}
            {(product.dimensions || product.condition) && (
              <div className="text-sm text-muted-foreground space-y-1">
                {product.dimensions && <p>尺寸: {product.dimensions}</p>}
                {product.condition && <p>状态: {product.condition}</p>}
              </div>
            )}

            {/* 话术标签页 */}
            {scripts && Object.keys(scripts).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="w-4 h-4" />
                    销售话术
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="sales" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      {Object.entries(SCRIPT_STYLE_LABELS).map(([key, label]) => (
                        <TabsTrigger key={key} value={key} disabled={!scripts[key]}>
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {Object.entries(SCRIPT_STYLE_LABELS).map(([key, label]) => (
                      <TabsContent key={key} value={key} className="mt-4">
                        {scripts[key] ? (
                          <div className="space-y-3">
                            <p className="text-sm leading-relaxed">{scripts[key]}</p>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant={copiedStyle === key ? 'secondary' : 'outline'}
                                onClick={() => copyScript(scripts[key], key)}
                              >
                                <Copy className="w-4 h-4 mr-1" />
                                {copiedStyle === key ? '已复制' : '复制'}
                              </Button>
                              <Button 
                                size="sm" 
                                variant={isSpeaking ? 'secondary' : 'outline'}
                                onClick={() => isSpeaking ? stop() : speakScript(scripts[key])}
                              >
                                {isSpeaking ? (
                                  <>
                                    <VolumeX className="w-4 h-4 mr-1" />
                                    停止
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-4 h-4 mr-1" />
                                    朗读
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">暂无此风格话术</p>
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* 价格记录 */}
            {priceRecords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="w-4 h-4" />
                    价格记录
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {priceRecords.map((record) => (
                      <div 
                        key={record.id} 
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant={record.price_type === 'sold' ? 'default' : 'secondary'}>
                            {record.price_type === 'sold' ? '成交' : record.price_type === 'suggested' ? 'AI建议' : '参考'}
                          </Badge>
                          <span className="font-semibold">¥{record.price.toLocaleString()}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(record.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ProductEditDialog
        product={product}
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

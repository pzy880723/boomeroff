import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Save, DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { RecognitionResult, PriceRecord } from '@/types';

interface PriceDisplayProps {
  result: RecognitionResult;
  productId?: string;
}

export function PriceDisplay({ result, productId }: PriceDisplayProps) {
  const [historicalPrices, setHistoricalPrices] = useState<PriceRecord[]>([]);
  const [newSoldPrice, setNewSoldPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const { role } = useAuth();
  const { toast } = useToast();

  const canEditPrice = role === 'admin' || role === 'anchor';

  useEffect(() => {
    if (productId) {
      fetchHistoricalPrices();
    }
  }, [productId]);

  const fetchHistoricalPrices = async () => {
    if (!productId) return;
    
    const { data, error } = await supabase
      .from('price_records')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHistoricalPrices(data as PriceRecord[]);
    }
  };

  const saveSoldPrice = async () => {
    if (!productId || !newSoldPrice) return;
    
    setSaving(true);
    try {
      const { error } = await supabase.from('price_records').insert({
        product_id: productId,
        price_type: 'sold',
        price: parseFloat(newSoldPrice),
      });

      if (error) throw error;

      toast({
        title: '价格已记录',
        description: `成交价 ¥${newSoldPrice} 已保存`,
      });
      setNewSoldPrice('');
      fetchHistoricalPrices();
    } catch (error) {
      toast({
        title: '保存失败',
        description: '请重试',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // 计算历史价格统计
  const soldPrices = historicalPrices
    .filter((p) => p.price_type === 'sold')
    .map((p) => p.price);
  
  const hasHistoricalData = soldPrices.length > 0;
  const avgHistoricalPrice = hasHistoricalData
    ? soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length
    : null;
  const minHistoricalPrice = hasHistoricalData ? Math.min(...soldPrices) : null;
  const maxHistoricalPrice = hasHistoricalData ? Math.max(...soldPrices) : null;

  // AI建议价格
  const aiPrices = result.suggestedPriceRange;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          价格参考
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI建议价格区域 */}
        {aiPrices && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">AI建议</Badge>
            </div>
            
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                  <TrendingDown className="w-3 h-3" />
                  最低
                </div>
                <div className="text-lg font-semibold">
                  ¥{aiPrices.min.toLocaleString()}
                </div>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 ring-2 ring-primary/20">
                <div className="flex items-center justify-center gap-1 text-primary text-xs mb-1">
                  <Minus className="w-3 h-3" />
                  建议价
                </div>
                <div className="text-xl font-bold text-primary">
                  ¥{Math.round(aiPrices.average).toLocaleString()}
                </div>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                  <TrendingUp className="w-3 h-3" />
                  最高
                </div>
                <div className="text-lg font-semibold">
                  ¥{aiPrices.max.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 历史成交区域 */}
        {hasHistoricalData && (
          <div className={aiPrices ? "border-t pt-3" : ""}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="default">历史成交</Badge>
              <span className="text-sm text-muted-foreground">({soldPrices.length}笔)</span>
            </div>
            
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-xs text-muted-foreground mb-1">最低成交</div>
                <div className="font-semibold">¥{minHistoricalPrice!.toLocaleString()}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-xs text-muted-foreground mb-1">平均成交</div>
                <div className="font-semibold">¥{Math.round(avgHistoricalPrice!).toLocaleString()}</div>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <div className="text-xs text-muted-foreground mb-1">最高成交</div>
                <div className="font-semibold">¥{maxHistoricalPrice!.toLocaleString()}</div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {soldPrices.slice(0, 5).map((price, i) => (
                <Badge key={i} variant="outline">
                  ¥{price.toLocaleString()}
                </Badge>
              ))}
              {soldPrices.length > 5 && (
                <Badge variant="outline">+{soldPrices.length - 5}...</Badge>
              )}
            </div>
          </div>
        )}

        {/* 无数据提示 */}
        {!aiPrices && !hasHistoricalData && (
          <p className="text-muted-foreground text-center py-4">暂无价格参考</p>
        )}

        {/* 记录成交价 - 仅小助理和管理员可见 */}
        {canEditPrice && productId && (
          <div className="border-t pt-3">
            <Label className="text-sm">记录本次成交价</Label>
            <div className="flex gap-2 mt-2">
              <Input
                type="number"
                placeholder="输入成交价格"
                value={newSoldPrice}
                onChange={(e) => setNewSoldPrice(e.target.value)}
              />
              <Button onClick={saveSoldPrice} disabled={saving || !newSoldPrice}>
                <Save className="w-4 h-4 mr-1" />
                保存
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

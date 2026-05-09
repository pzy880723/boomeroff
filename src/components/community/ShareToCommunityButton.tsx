import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Share2, Check, Loader2 } from 'lucide-react';
import type { ProductCategory } from '@/types';
import { serializeTips, type SellingPoint, type TipsObj } from '@/lib/script';

interface ShareToCommunityButtonProps {
  productId: string;
  name: string;
  category: ProductCategory;
  era?: string | null;
  origin?: string | null;
  imageUrl?: string | null;
  sellingPoints?: Array<string | SellingPoint | { tag: string; text: string }>;
  tips?: string | TipsObj | null;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'sm' | 'lg' | 'default';
  className?: string;
  /** 自定义按钮文案；不传则使用默认文案 */
  label?: string;
  sharedLabel?: string;
}

/**
 * 手动分享识别结果到「中古圈」社区。
 * 自动检测当前用户是否已分享过，已分享则禁用并显示「已分享」。
 */
export function ShareToCommunityButton({
  productId, name, category, era, origin, imageUrl,
  sellingPoints = [], tips,
  variant = 'default', size = 'lg', className = '',
  label = '分享到中古圈 · 让更多店员看到',
  sharedLabel = '已分享到中古圈',
}: ShareToCommunityButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shared, setShared] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // 懒检查
  const ensureChecked = async () => {
    if (shared !== null || !user) return;
    const { data } = await supabase
      .from('community_posts')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle();
    setShared(!!data);
  };

  const handleClick = async () => {
    if (!user) return;
    if (shared === null) await ensureChecked();
    if (shared) return;
    setBusy(true);
    try {
      // selling_points 在 community_posts 里仍按 jsonb 存原始结构
      const { error } = await supabase.from('community_posts').insert({
        user_id: user.id,
        product_id: productId,
        image_url: imageUrl || null,
        name,
        category,
        era: era || null,
        origin: origin || null,
        selling_points: sellingPoints as any,
        tips: serializeTips(tips ?? null),
        is_public: true,
      });
      if (error) throw error;
      setShared(true);
      toast({ title: '已分享到中古圈', description: '同事们可以在「中古圈」里看到你的发现' });
    } catch (e: any) {
      console.error('[ShareToCommunity] error:', e);
      toast({ title: '分享失败', description: e?.message || '请重试', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={shared ? 'outline' : variant}
      size={size}
      onClick={handleClick}
      onMouseEnter={ensureChecked}
      onFocus={ensureChecked}
      disabled={busy || shared === true}
      className={`gap-2 ${className}`}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : shared ? (
        <Check className="w-4 h-4" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
      {shared ? sharedLabel : label}
    </Button>
  );
}

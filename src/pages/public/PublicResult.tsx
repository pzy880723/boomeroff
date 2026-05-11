import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Share2, Check, Loader2, ChevronLeft } from 'lucide-react';
import { ProductDetailCard } from '@/components/recognition/ProductDetailCard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GuestRecognitionResult } from '@/hooks/useGuestRecognition';

export default function PublicResult() {
  const navigate = useNavigate();
  const [result, setResult] = useState<GuestRecognitionResult | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('guest_result');
    const img = sessionStorage.getItem('guest_result_image');
    if (!raw) {
      navigate('/u', { replace: true });
      return;
    }
    try { setResult(JSON.parse(raw)); } catch { navigate('/u', { replace: true }); }
    if (img) setImage(img);
  }, [navigate]);

  const handleShare = async () => {
    if (!result || sharing || shared) return;
    setSharing(true);
    try {
      const body: Record<string, unknown> = {
        name: result.name,
        category: result.category,
        era: result.era || null,
        origin: result.origin || null,
        sellingPoints: result.sellingPoints || [],
        tips: result.tips ?? null,
      };
      if (image) body.imageBase64 = image;
      const { data, error } = await supabase.functions.invoke('submit-public-post', { body });
      if (error) throw new Error((error as any).message || '发布失败');
      if (data?.error) throw new Error(data.error);
      setShared(true);
      toast.success('已匿名发布到中古圈', {
        description: '其他人现在可以看到你的发现',
      });
    } catch (e: any) {
      toast.error(e?.message || '发布失败，请稍后再试');
    } finally {
      setSharing(false);
    }
  };

  if (!result) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-screen-md py-3 space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/u')} className="gap-1 -ml-2">
          <ChevronLeft className="w-4 h-4" /> 返回
        </Button>
        {typeof result.remaining === 'number' && (
          <span className="text-xs text-muted-foreground">今日还可识别 {result.remaining} 次</span>
        )}
      </div>

      <ProductDetailCard result={result} imageUrl={image} />

      <Card className="border-primary/30">
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium">分享你的发现</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            点击下方按钮，将以「<span className="text-foreground">游客</span>」身份匿名发布到「中古圈」。
            其他用户可以看到你拍到的这件物品。
          </p>
          <Button
            onClick={handleShare}
            disabled={sharing || shared}
            className="w-full gap-2"
            size="lg"
            variant={shared ? 'outline' : 'default'}
          >
            {sharing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : shared ? (
              <Check className="w-4 h-4" />
            ) : (
              <Share2 className="w-4 h-4" />
            )}
            {shared ? '已分享到中古圈' : '匿名分享到中古圈'}
          </Button>
          {shared && (
            <Link to="/u/community" className="block text-center text-xs text-primary underline-offset-2 hover:underline">
              去中古圈看看 →
            </Link>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full gap-2" onClick={() => navigate('/u')}>
        <Camera className="w-4 h-4" /> 再拍一件
      </Button>
    </div>
  );
}

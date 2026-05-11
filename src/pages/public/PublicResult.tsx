import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Camera, Share2, Check, Loader2, ChevronLeft, Sparkles } from 'lucide-react';
import { GuestProductCard } from '@/components/recognition/GuestProductCard';
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
    <div className="container max-w-screen-md py-3 space-y-4">
      {/* 顶部返回条 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/u')} className="gap-1 -ml-2 text-foreground/80">
          <ChevronLeft className="w-4 h-4" /> 返回
        </Button>
        {typeof result.remaining === 'number' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums px-2.5 py-1 rounded-full bg-card ring-1 ring-border/50">
            <Sparkles className="w-3 h-3 text-accent" />
            今日剩余 {result.remaining} 次
          </span>
        )}
      </div>

      <GuestProductCard result={result} imageUrl={image} />

      {/* 分享卡片 */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-primary text-primary-foreground p-5 shadow-elevated">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 rounded-full bg-accent/20 blur-2xl pointer-events-none" />
        <div className="relative space-y-3">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase opacity-80">Share Discovery</div>
            <h3 className="mt-1 font-display text-lg tracking-tight">分享你的发现</h3>
          </div>
          <p className="text-[12.5px] leading-relaxed opacity-85">
            以「<span className="font-medium opacity-100">游客</span>」身份匿名发布到「中古圈」，让更多人看见这件好物。
          </p>
          <Button
            onClick={handleShare}
            disabled={sharing || shared}
            className="w-full gap-2 bg-white text-neutral-900 hover:bg-white/90"
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
            <Link
              to="/u/community"
              className="block text-center text-xs underline-offset-2 hover:underline opacity-90"
            >
              去中古圈看看 →
            </Link>
          )}
        </div>
      </section>

      <Button variant="outline" className="w-full gap-2" onClick={() => navigate('/u')}>
        <Camera className="w-4 h-4" /> 再拍一件
      </Button>
    </div>
  );
}

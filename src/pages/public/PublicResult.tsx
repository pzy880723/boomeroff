import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Camera, Share2, Check, Loader2, ChevronLeft, Sparkles, ImageOff, Aperture } from 'lucide-react';
import { GuestProductCard } from '@/components/recognition/GuestProductCard';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GuestRecognitionResult } from '@/hooks/useGuestRecognition';

type ViewState = 'loading' | 'empty' | 'ready';

export default function PublicResult() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('loading');
  const [result, setResult] = useState<GuestRecognitionResult | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('guest_result');
    const img = sessionStorage.getItem('guest_result_image');
    if (!raw) {
      setView('empty');
      return;
    }
    try {
      setResult(JSON.parse(raw));
      if (img) setImage(img);
      setView('ready');
    } catch {
      setView('empty');
    }
  }, []);

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
      toast.success('已匿名发布到中古圈', { description: '其他人现在可以看到你的发现' });
    } catch (e: any) {
      toast.error(e?.message || '发布失败，请稍后再试');
    } finally {
      setSharing(false);
    }
  };

  // —— 加载骨架 ——
  if (view === 'loading') {
    return (
      <div className="container max-w-screen-md py-4 space-y-5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-7 w-16 rounded-full bg-muted" />
          <div className="h-6 w-24 rounded-full bg-muted" />
        </div>
        <div className="aspect-[4/3] w-full rounded-3xl bg-muted" />
        <div className="space-y-2 px-1">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-7 w-3/4 bg-muted rounded" />
        </div>
        <div className="border-t border-border/60 pt-4 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-12 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
        <div className="h-32 rounded-2xl bg-muted" />
      </div>
    );
  }

  // —— 空状态：直接打开 /u/result 但没有结果 ——
  if (view === 'empty' || !result) {
    return (
      <div className="container max-w-screen-md py-10 px-4">
        <div className="mx-auto max-w-sm text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <ImageOff className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80">
              No Result Yet
            </div>
            <h1 className="font-display text-[22px] leading-tight tracking-tight">
              还没有识别记录
            </h1>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              结果会在你拍完照后显示在这里。先去拍一件中古好物吧。
            </p>
          </div>
          <Button asChild size="lg" className="w-full gap-2">
            <Link to="/u">
              <Camera className="w-4 h-4" /> 去拍一拍
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // —— 正常结果页 ——
  return (
    <div className="container max-w-screen-md py-3 space-y-6">
      {/* 顶部返回条 */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/u')}
          className="gap-1 -ml-2 text-foreground/80 hover:bg-muted/60"
        >
          <ChevronLeft className="w-4 h-4" /> 返回
        </Button>
        {typeof result.remaining === 'number' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums px-2.5 py-1 rounded-full bg-card ring-1 ring-border/50">
            <Sparkles className="w-3 h-3 text-accent" />
            今日剩余 {result.remaining} 次
          </span>
        )}
      </div>

      {/* 编辑式结果卡 */}
      <GuestProductCard result={result} imageUrl={image} />

      {/* 分享 hero 卡 */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-primary text-primary-foreground p-6 shadow-elevated">
        <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-accent/25 blur-3xl pointer-events-none" />
        <div className="absolute -left-6 -top-6 w-28 h-28 rounded-full bg-accent/10 blur-2xl pointer-events-none" />
        <div className="relative space-y-4">
          <div>
            <div className="text-[10px] tracking-[0.22em] uppercase opacity-80">Share Your Find</div>
            <h3 className="mt-1.5 font-display text-[20px] leading-tight tracking-tight">
              让更多人看见这件好物
            </h3>
            <p className="mt-2 text-[12.5px] leading-relaxed opacity-85 max-w-[24rem]">
              以「<span className="font-medium opacity-100">游客</span>」身份匿名发布到「中古圈」，
              不会留下任何账号信息，也不必登录。
            </p>
          </div>
          <Button
            onClick={handleShare}
            disabled={sharing || shared}
            className="w-full gap-2 bg-white text-neutral-900 hover:bg-white/90"
            size="lg"
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

      {/* 下一步 */}
      <section className="space-y-2">
        <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80 px-1">
          What&rsquo;s Next
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="outline"
            className="h-auto py-3.5 flex-col gap-1.5 rounded-2xl"
            onClick={() => navigate('/u')}
          >
            <Camera className="w-4 h-4 text-accent" />
            <span className="text-[12.5px] font-medium">再拍一件</span>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto py-3.5 flex-col gap-1.5 rounded-2xl"
          >
            <Link to="/u/community">
              <Aperture className="w-4 h-4 text-accent" />
              <span className="text-[12.5px] font-medium">逛中古圈</span>
            </Link>
          </Button>
        </div>
      </section>

      {/* 品牌底栏 */}
      <div className="text-center pt-2 pb-1">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70 tracking-[0.2em] uppercase">
          <Aperture className="w-3 h-3" />
          BOOMER-OFF · 中古杂货
        </div>
      </div>
    </div>
  );
}

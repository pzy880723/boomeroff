import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, ArrowRight, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveShop } from '@/hooks/useShops';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import boomerIdle from '@/assets/boomer/boomer-idle.png';

interface Picked {
  asset_id: string;
  cover_url: string;
  title: string;
  summary: string;
  tags: string[];
  category: string | null;
}
interface SurpriseResult {
  ok: boolean;
  picked: Picked;
  vtype: string;
  vtype_label: string;
  style: string;
  character: { id: string; name: string; cover_url: string | null } | null;
  duration: number;
  aspect: string;
  job_id?: string;
}

const STYLE_LABEL: Record<string, string> = {
  steady: '稳重', lively: '活泼', energetic: '激动',
  elegant: '优雅', nostalgic: '怀旧', playful: '俏皮',
};

export function SurpriseVideoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { shopId } = useEffectiveShop();
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pick, setPick] = useState<SurpriseResult | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  const doPick = async (exclude: string[] = []) => {
    if (!shopId) return;
    setPicking(true); setPick(null);
    try {
      const { data, error } = await supabase.functions.invoke('surprise-marketing-video', {
        body: { shop_id: shopId, preview: true, exclude_asset_ids: exclude },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok === false) throw new Error(d.error || '随机失败');
      setPick(d as SurpriseResult);
    } catch (e: any) {
      toast.error(e?.message || '随机失败');
      onOpenChange(false);
    } finally { setPicking(false); }
  };

  useEffect(() => {
    if (open) {
      setJobId(null); setPick(null); setExcluded([]);
      doPick([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopId]);

  const reroll = () => {
    const newEx = pick ? Array.from(new Set([...excluded, pick.picked.asset_id])).slice(-20) : excluded;
    setExcluded(newEx);
    doPick(newEx);
  };

  const start = async () => {
    if (!shopId || !pick) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('surprise-marketing-video', {
        body: { shop_id: shopId, preview: false, exclude_asset_ids: excluded.filter((id) => id !== pick.picked.asset_id) },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok === false || !d?.job_id) throw new Error(d?.error || '提交失败');
      setJobId(d.job_id);
      toast.success('已入队,正在生成视频…');
    } catch (e: any) {
      toast.error(e?.message || '提交失败');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-accent" />
            BOOMER 帮你拍一条
          </DialogTitle>
        </DialogHeader>

        {jobId ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center text-center gap-3">
              <img src={boomerIdle} alt="" className="w-20 h-20 object-contain" />
              <div>
                <div className="text-base font-semibold">惊喜正在路上 🎬</div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  视频在后台生成,大约 1–2 分钟。<br />到素材库就能看到成品。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>关闭</Button>
              <Link to="/me/marketing/library" className="flex-1">
                <Button className="w-full">去素材库 <ArrowRight className="w-4 h-4 ml-1" /></Button>
              </Link>
            </div>
          </div>
        ) : picking || !pick ? (
          <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            BOOMER 正在你的素材库里翻找灵感…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/20 overflow-hidden bg-muted">
              <div className="aspect-[9/16] max-h-[280px] mx-auto bg-black/5 relative">
                <img src={pick.picked.cover_url} alt="" className="w-full h-full object-cover" />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-semibold tracking-wide">
                  9:16 · 15s
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[15px] font-semibold leading-snug line-clamp-2">
                {pick.picked.title}
              </div>
              {pick.picked.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{pick.picked.summary}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Chip>路线 · {pick.vtype_label}</Chip>
                <Chip>风格 · {STYLE_LABEL[pick.style] || pick.style}</Chip>
                {pick.character && <Chip>主角 · {pick.character.name}</Chip>}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={reroll} disabled={submitting}>
                <RefreshCw className="w-4 h-4 mr-1" /> 换一组
              </Button>
              <Button className="flex-1" onClick={start} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                就拍这条
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              脚本、镜头、风格都按店铺调性自动生成,不满意可以再来一条
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border border-accent/30 bg-accent/5 text-foreground/80 tracking-wide">
      {children}
    </span>
  );
}

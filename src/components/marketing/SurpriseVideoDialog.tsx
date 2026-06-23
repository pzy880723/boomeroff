import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, ArrowRight, Wand2, Camera, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveShop } from '@/hooks/useShops';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import boomerIdle from '@/assets/boomer/boomer-idle.png';

interface PickedAsset {
  asset_id: string;
  index: number;
  url: string;
  summary: string;
  category: string | null;
}

interface SceneClip {
  scene?: string;
  action?: string;
  dialogue?: string;
  subtitle?: string;
  duration_s?: number;
  motion?: string;
  image_index?: number | null;
}

interface ScriptShape {
  hook?: SceneClip | null;
  scenes?: SceneClip[];
  outro?: SceneClip | null;
  total_duration_s?: number;
  bgm?: string;
}

interface SurpriseResult {
  ok: boolean;
  picked: { asset_id: string; cover_url: string; summary: string; category: string | null; tags: string[] };
  assets: PickedAsset[];
  script: ScriptShape;
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
        body: {
          shop_id: shopId,
          preview: false,
          script: pick.script,
          picked_assets: pick.assets,
          vtype: pick.vtype,
          style: pick.style,
        },
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
      <DialogContent className="max-w-md max-h-[88vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-accent" />
            BOOMER 帮你拍一条
          </DialogTitle>
        </DialogHeader>

        {jobId ? (
          <div className="space-y-4 p-5">
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
          <div className="py-16 px-5 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            BOOMER 正在挑素材、写脚本…
            <span className="text-[10px]">通常 3–8 秒</span>
          </div>
        ) : (
          <>
            <ScriptBody pick={pick} />
            <div className="border-t px-5 pt-3 pb-4 space-y-2 bg-background">
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={reroll} disabled={submitting}>
                  <RefreshCw className="w-4 h-4 mr-1" /> 换一组
                </Button>
                <Button className="flex-1" onClick={start} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  就拍这条
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground">
                所有画面都来自你的素材库,渲染时严格按这份脚本执行
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScriptBody({ pick }: { pick: SurpriseResult }) {
  const clips: { label: string; clip: SceneClip }[] = [];
  if (pick.script.hook) clips.push({ label: '钩子', clip: pick.script.hook });
  (pick.script.scenes || []).forEach((s, i) => clips.push({ label: `镜头${i + 1}`, clip: s }));
  if (pick.script.outro) clips.push({ label: '收尾', clip: pick.script.outro });

  // 计算每镜起始时间
  let acc = 0;
  const withTime = clips.map(({ label, clip }) => {
    const start = acc;
    const dur = Number(clip.duration_s) || 2;
    acc += dur;
    return { label, clip, start, dur };
  });

  const assetByIdx = new Map(pick.assets.map((a) => [a.index, a]));

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
      {/* 顶部 chip 行 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
          9:16 · 15s
        </span>
        <Chip>路线 · {pick.vtype_label}</Chip>
        <Chip>风格 · {STYLE_LABEL[pick.style] || pick.style}</Chip>
        {pick.character && <Chip>主角 · {pick.character.name}</Chip>}
      </div>

      {/* 入选素材缩略行 */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-1.5">入选素材 · {pick.assets.length} 张实景</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {pick.assets.map((a) => (
            <div key={a.asset_id} className="shrink-0 w-14 h-20 rounded-md overflow-hidden bg-muted ring-1 ring-border relative">
              <img src={a.url} alt="" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 right-0 px-1 text-[9px] bg-black/55 text-white rounded-tl">#{a.index}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 分镜列表 */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-2">BOOMER 拟好的脚本 · {clips.length} 个分镜</div>
        <div className="space-y-2">
          {withTime.map(({ label, clip, start, dur }, i) => {
            const idx = clip.image_index;
            const asset = typeof idx === 'number' ? assetByIdx.get(idx) : undefined;
            return (
              <div key={i} className="flex gap-2.5 p-2 rounded-lg border bg-card">
                <div className="shrink-0 w-14 h-20 rounded-md overflow-hidden bg-muted relative">
                  {asset ? (
                    <img src={asset.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground text-center px-1">
                      自由<br />镜头
                    </div>
                  )}
                  <div className="absolute top-0 left-0 px-1 text-[9px] bg-black/55 text-white rounded-br">{label}</div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold tracking-wide text-accent">
                      {start.toFixed(1)}s – {(start + dur).toFixed(1)}s
                    </div>
                    {clip.motion && (
                      <span className="text-[10px] text-muted-foreground">{clip.motion}</span>
                    )}
                  </div>
                  {clip.scene && (
                    <div className="text-[12px] leading-snug">
                      <span className="text-muted-foreground">场景 · </span>{clip.scene}
                    </div>
                  )}
                  {clip.action && (
                    <div className="text-[12px] leading-snug flex gap-1">
                      <Camera className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{clip.action}</span>
                    </div>
                  )}
                  {clip.dialogue && (
                    <div className="text-[12px] leading-snug flex gap-1 text-foreground/85">
                      <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>"{clip.dialogue}"</span>
                    </div>
                  )}
                  {clip.subtitle && (
                    <div className="text-[11px] leading-snug text-muted-foreground">
                      字幕:{clip.subtitle}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border border-accent/30 bg-accent/5 text-foreground/80 tracking-wide">
      {children}
    </span>
  );
}

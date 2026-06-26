import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveShop } from '@/hooks/useShops';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Link } from 'react-router-dom';
import {
  Sparkles, FileText, Video, Library, ChevronRight, Loader2, Share2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import boomerIdle from '@/assets/boomer/boomer-idle.png';
import { SurpriseVideoDialog } from '@/components/marketing/SurpriseVideoDialog';
import { getActiveRenderJob } from '@/lib/surpriseJob';

interface RecentItem { id: string; kind: string; output_url: string | null; created_at: string; }

export default function MyMarketing() {
  const { user, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState({ photo: 0, copy: 0, video: 0 });
  const [today, setToday] = useState(0);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [surpriseOpen, setSurpriseOpen] = useState(false);
  const { shopId } = useEffectiveShop();
  const [hasActiveJob, setHasActiveJob] = useState(false);

  useEffect(() => {
    if (!shopId) { setHasActiveJob(false); return; }
    const refresh = () => setHasActiveJob(!!getActiveRenderJob(shopId));
    refresh();
    const onChange = () => refresh();
    const onStorage = (e: StorageEvent) => { if (e.key && e.key.includes('boomer.surprise.job')) refresh(); };
    window.addEventListener('boomer.surprise.change', onChange as EventListener);
    window.addEventListener('storage', onStorage);
    const t = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('boomer.surprise.change', onChange as EventListener);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(t);
    };
  }, [shopId]);


  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const since30 = new Date(); since30.setDate(since30.getDate() - 30);
      const sinceISO = since30.toISOString();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();
      const [p, c, v, t, recent] = await Promise.all([
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'photo').gte('created_at', sinceISO),
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'copy').gte('created_at', sinceISO),
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'video').gte('created_at', sinceISO),
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', todayISO),
        supabase.from('marketing_assets' as any).select('id, kind, output_url, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
      ]);
      setCounts({ photo: p.count || 0, copy: c.count || 0, video: v.count || 0 });
      setToday(t.count || 0);
      setRecents(((recent.data as any[]) || []) as RecentItem[]);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="营销中心" back="/me" subtitle="一键出图 · 一键出文 · 一键出片" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 pb-12 space-y-5 relative">

        {/* ===== Hero · 年鉴封面 ===== */}
        <section className="relative bg-card rounded-[0.875rem] border border-accent/15 shadow-sm overflow-hidden animate-card-enter">
          <div className="p-5 flex justify-between items-end gap-3">
            <div className="relative z-10 flex-1 min-w-0">
              <SectionLabel>BOOMER · AI 营销助手</SectionLabel>
              <h2 className="font-display text-[26px] leading-[1.15] mt-2 text-foreground">
                {today > 0 ? `今天已经产出 ${today} 条` : '今天还没发，先做一条？'}
              </h2>
              <div className="mt-4 border-t border-border pt-3 flex items-end gap-5">
                <Metric label="图片" value={counts.photo} />
                <Metric label="文案" value={counts.copy} />
                <Metric label="视频" value={counts.video} />
                <span className="ml-auto font-display italic text-[11px] text-accent">近 30 日</span>
              </div>
            </div>
            <img
              src={boomerIdle}
              alt=""
              className="w-24 h-24 object-contain shrink-0 -mr-1 -mb-1 select-none"
              draggable={false}
            />
          </div>
        </section>

        {/* ===== 惊喜一下 · 一键随机视频 ===== */}
        <button
          type="button"
          onClick={() => setSurpriseOpen(true)}
          className="group w-full text-left bg-card rounded-[0.875rem] border border-accent/30 shadow-sm p-4 pl-5 flex items-center gap-3.5 relative overflow-hidden transition-all hover:border-accent/50 active:scale-[0.995] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[2px] before:bg-accent/70 before:rounded-r"
        >
          <img
            src={boomerIdle}
            alt=""
            className="w-10 h-10 object-contain shrink-0 select-none"
            draggable={false}
          />
          <div className="flex-1 min-w-0">
            <div className="font-display text-[10px] tracking-[0.18em] text-accent">惊喜 · SURPRISE</div>
            <h3 className="text-[15px] font-semibold leading-tight mt-0.5 truncate">
              让 BOOMER 替你拍一条
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">
              自动选图 · 写脚本 · 竖版 15 秒
            </p>
          </div>
          {hasActiveJob ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide px-2 py-1 rounded-full bg-accent/10 text-accent border border-accent/30">
              <Loader2 className="w-3 h-3 animate-spin" />
              生成中
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider px-2 py-1 rounded-full border border-accent/30 text-accent">
              9:16 · 15s
              <ChevronRight className="w-3 h-3" />
            </span>
          )}
        </button>


        {/* ===== 三大工具 ===== */}
        <section className="space-y-3">
          <SectionLabel className="px-1">创作工坊</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <ToolTile
              to="/me/marketing/photo"
              num="01"
              icon={Sparkles}
              title="AI 图片"
              desc="对话出图 · 改图 · 海报"
            />
            <ToolTile
              to="/me/marketing/copy"
              num="02"
              icon={FileText}
              title="AI 文案"
              desc="看图写文 · 平台口吻"
            />
          </div>
          <Link to="/me/marketing/video" className="block">
            <div className="group bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-4 flex items-center gap-4 transition-all hover:border-accent/40 active:scale-[0.995]">
              <div className="w-12 h-12 rounded-xl bg-primary/95 text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
                <Video className="w-6 h-6" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[10px] text-accent tracking-[0.18em]">03</span>
                  <h3 className="text-[15px] font-semibold leading-none">AI 视频</h3>
                  <span className="ml-auto text-[10px] tracking-[0.18em] text-accent font-semibold">15-30 秒</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
                  文字立意 · 参考图辅助 · AI 出片
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        </section>


        {/* ===== 工作流提示带 ===== */}
        <section className="px-1">
          <div className="flex items-center justify-between relative">
            <div className="absolute h-px left-5 right-5 top-4 bg-accent/25 -translate-y-1/2" />
            <FlowDot num="01" label="拍图 / 上传" />
            <FlowDot num="02" label="AI 产出" active />
            <FlowDot num="03" label="复制发布" />
          </div>
        </section>

        {/* ===== 素材库 ===== */}
        <section>
          <Link to="/me/marketing/library" className="block">
            <div className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-4 flex items-center gap-4 transition-all hover:border-accent/40 active:scale-[0.995]">
              <div className="flex -space-x-2.5 shrink-0">
                {loading ? (
                  <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
                ) : recents.length === 0 ? (
                  <div className="w-10 h-10 rounded-lg bg-muted border border-card flex items-center justify-center">
                    <Library className="w-4 h-4 text-muted-foreground" />
                  </div>
                ) : (
                  recents.map((r, i) => (
                    <div
                      key={r.id}
                      className="w-10 h-10 rounded-lg border-2 border-card bg-muted overflow-hidden flex items-center justify-center shadow-sm"
                      style={{ zIndex: 3 - i }}
                    >
                      {r.output_url && r.kind === 'photo' ? (
                        <img src={r.output_url} alt="" className="w-full h-full object-cover" />
                      ) : r.kind === 'copy' ? (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Video className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[10px] text-accent tracking-[0.18em]">归档</span>
                  <h3 className="text-[15px] font-semibold leading-none">素材库</h3>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">历史产出 · 一键复制 · 下载视频</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </div>
          </Link>
        </section>

        {/* ===== 底部说明 ===== */}
        <p className="text-[10px] text-center text-muted-foreground tracking-wide leading-relaxed pt-2">
          品牌信息 · 商品类目 · 门店定位
          <br />
          <span className="text-accent font-semibold">已经预设给 AI，不用每次再说一遍</span>
        </p>

        {/* 底部细古铜金线 */}
        <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-accent/20 pointer-events-none" />
      </div>

      <SurpriseVideoDialog open={surpriseOpen} onOpenChange={setSurpriseOpen} />
    </>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="w-1 h-1 rounded-full bg-accent" />
      <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">
        {children}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] text-muted-foreground tracking-wide">{label}</span>
      <span className="font-display text-base text-foreground">{value}</span>
    </div>
  );
}

function ToolTile({
  to, num, icon: Icon, title, desc,
}: { to: string; num: string; icon: any; title: string; desc: string }) {
  return (
    <Link to={to} className="block">
      <div className="group h-full bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-4 flex flex-col justify-between min-h-[132px] transition-all hover:border-accent/40 active:scale-[0.985]">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
            <Icon className="w-5 h-5" strokeWidth={1.5} />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className="font-display text-[10px] text-accent tracking-[0.18em]">{num}</span>
          </div>
          <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{desc}</p>
        </div>
      </div>
    </Link>
  );
}


function FlowDot({ num, label, active = false }: { num: string; label: string; active?: boolean }) {
  return (
    <div className="relative flex flex-col items-center gap-1.5 z-10 w-16">
      <div
        className={[
          'w-8 h-8 rounded-full flex items-center justify-center shadow-sm transition-all',
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border border-accent/30 text-accent',
        ].join(' ')}
      >
        <span className="font-display text-[11px] leading-none">{num}</span>
      </div>
      <span
        className={[
          'text-[10px] tracking-wide',
          active ? 'text-foreground font-medium' : 'text-muted-foreground',
        ].join(' ')}
      >
        {label}
      </span>
    </div>
  );
}

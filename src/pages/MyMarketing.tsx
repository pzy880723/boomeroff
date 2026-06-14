import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import {
  Sparkles, FileText, Video, Library, ChevronRight, Loader2,
  Camera, Send, Wand2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import boomerIdle from '@/assets/boomer/boomer-idle.png';

interface RecentItem { id: string; kind: string; output_url: string | null; created_at: string; }

export default function MyMarketing() {
  const { user, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState({ photo: 0, copy: 0, video: 0 });
  const [today, setToday] = useState(0);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4 pb-10">

        {/* ===== Hero ===== */}
        <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/15 p-5">
          <div className="absolute -right-2 -bottom-2 opacity-30 pointer-events-none select-none">
            <img src={boomerIdle} alt="" className="w-28 h-28 object-contain" draggable={false} />
          </div>
          <div className="relative space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] tracking-wide text-primary/90 font-medium">BOOMER · AI 营销助手</span>
            </div>
            <h2 className="text-xl font-semibold">
              {today > 0 ? `今天已经产出 ${today} 条 ✨` : '今天还没发,先做一条?'}
            </h2>
            <p className="text-xs text-muted-foreground">
              近 30 天 · 图片 <b className="text-foreground">{counts.photo}</b> · 文案 <b className="text-foreground">{counts.copy}</b> · 视频 <b className="text-foreground">{counts.video}</b>
            </p>
          </div>
        </div>

        {/* ===== 三大工具 ===== */}
        <div className="grid grid-cols-2 gap-3">
          <ToolCard
            to="/me/marketing/photo"
            icon={Sparkles}
            title="图片优化"
            desc="只修瑕疵,不加滤镜"
            count={counts.photo}
            accent="from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400"
          />
          <ToolCard
            to="/me/marketing/copy"
            icon={FileText}
            title="AI 文案"
            desc="看图写文,平台口吻"
            count={counts.copy}
            accent="from-sky-500/15 to-sky-500/0 text-sky-600 dark:text-sky-400"
          />
          <Link to="/me/marketing/video" className="col-span-2">
            <Card className="relative overflow-hidden p-4 rounded-2xl hover:bg-accent/5 transition-all active:scale-[0.99] border-border/60">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/12 via-primary/5 to-transparent pointer-events-none" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Video className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">AI 视频</h3>
                    {counts.video > 0 && <Badge variant="secondary" className="text-[10px]">{counts.video}</Badge>}
                    <Badge variant="outline" className="text-[10px]">15–30 秒</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">先分析素材是否足够 → 再确认脚本 → 最后渲染,不浪费算力</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Card>
          </Link>
        </div>

        {/* ===== 工作流提示带 ===== */}
        <Card className="p-3 rounded-2xl bg-muted/40 border-dashed">
          <div className="flex items-center justify-between gap-2">
            <FlowStep icon={Camera} label="拍图/上传" />
            <FlowArrow />
            <FlowStep icon={Wand2} label="修图/写文/做片" />
            <FlowArrow />
            <FlowStep icon={Send} label="复制到平台发布" />
          </div>
        </Card>

        {/* ===== 素材库 ===== */}
        <Link to="/me/marketing/library">
          <Card className="p-4 rounded-2xl flex items-center gap-3 hover:bg-accent/10 transition-colors active:scale-[0.99]">
            <div className="flex -space-x-2">
              {loading ? (
                <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
              ) : recents.length === 0 ? (
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Library className="w-4 h-4 text-muted-foreground" />
                </div>
              ) : (
                recents.map((r, i) => (
                  <div key={r.id} className="w-9 h-9 rounded-lg border-2 border-background bg-muted overflow-hidden flex items-center justify-center" style={{ zIndex: 3 - i }}>
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
              <p className="text-sm font-medium">素材库</p>
              <p className="text-[11px] text-muted-foreground">看历史产出 · 一键复制 · 下载视频</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Card>
        </Link>

        <p className="text-[11px] text-muted-foreground text-center pt-1">
          品牌信息 · 商品类目 · 门店定位 已经预设给 AI,不用每次再说一遍。
        </p>
      </div>
    </>
  );
}

function ToolCard({
  to, icon: Icon, title, desc, count, accent,
}: { to: string; icon: any; title: string; desc: string; count: number; accent: string }) {
  return (
    <Link to={to}>
      <Card className="relative h-full overflow-hidden p-4 rounded-2xl hover:bg-accent/5 transition-all active:scale-[0.98] border-border/60">
        <div className={`absolute inset-0 bg-gradient-to-br ${accent} pointer-events-none opacity-90`} />
        <div className="relative space-y-3">
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-background/70 backdrop-blur flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </div>
            {count > 0 && <Badge variant="secondary" className="text-[10px]">{count}</Badge>}
          </div>
          <div>
            <h3 className="text-base font-semibold leading-tight">{title}</h3>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function FlowStep({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <div className="w-7 h-7 rounded-full bg-background border flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <span className="text-[10px] text-muted-foreground truncate">{label}</span>
    </div>
  );
}

function FlowArrow() {
  return <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />;
}

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Sparkles, FileText, Video, Library, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AuthPage } from '@/components/auth/AuthPage';

export default function MyMarketing() {
  const { user, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState({ photo: 0, copy: 0, video: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceISO = since.toISOString();
      const [p, c, v] = await Promise.all([
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'photo').gte('created_at', sinceISO),
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'copy').gte('created_at', sinceISO),
        supabase.from('marketing_assets' as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'video').gte('created_at', sinceISO),
      ]);
      setCounts({ photo: p.count || 0, copy: c.count || 0, video: v.count || 0 });
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  const tools = [
    { to: '/me/marketing/photo', icon: Sparkles, title: '图片优化', desc: '把店员随手拍变成能发的图', count: counts.photo, hint: '只修瑕疵 · 不加滤镜' },
    { to: '/me/marketing/copy', icon: FileText, title: 'AI 文案', desc: '看图写文，平台口吻', count: counts.copy, hint: '小红书 / 抖音 / 视频号 / 朋友圈' },
    { to: '/me/marketing/video', icon: Video, title: 'AI 视频', desc: '脚本确认 → 渲染', count: counts.video, hint: '15–30 秒 · 先看脚本再花算力' },
  ];

  return (
    <>
      <PageHeader title="营销中心" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        <Card className="p-4">
          <p className="text-sm font-medium mb-1">近 30 天产出</p>
          <p className="text-xs text-muted-foreground">
            {loading ? '统计中…' : `图片 ${counts.photo} · 文案 ${counts.copy} · 视频 ${counts.video}`}
          </p>
        </Card>

        <div className="space-y-3">
          {tools.map((t) => (
            <Link key={t.to} to={t.to}>
              <Card className="p-4 flex items-center gap-4 hover:bg-accent/10 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <t.icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{t.title}</h3>
                    {t.count > 0 && <Badge variant="secondary" className="text-[10px]">{t.count}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.desc}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{t.hint}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>

        <Link to="/me/marketing/library">
          <Card className="p-4 flex items-center gap-3 hover:bg-accent/10 transition-colors">
            <Library className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">素材库 · 看历史产出</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Card>
        </Link>

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          品牌信息（BOOMER·OFF 中古连锁）已经预设给 AI，文案与脚本会自动套用。
        </p>
      </div>
    </>
  );
}

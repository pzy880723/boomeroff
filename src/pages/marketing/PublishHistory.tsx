// 发布历史:列出 shop 下所有 social_publish_jobs;支持取消未到时间的定时;
// 单击进入工作台查看详情/重试。
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveShop } from '@/hooks/useShops';
import { AuthPage } from '@/components/auth/AuthPage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Clock, CheckCircle2, AlertCircle, CircleSlash, Send } from 'lucide-react';

const PLATFORM_LABEL: Record<string, string> = {
  douyin: '抖音', xhs: '小红书', wechat_video: '视频号', kuaishou: '快手',
};

interface Job {
  id: string; title: string | null; cover_url: string | null; status: string;
  schedule_at: string | null; created_at: string; updated_at: string; asset_id: string | null;
}
interface Target {
  id: string; job_id: string; platform: string; status: string; error_message: string | null;
  social_accounts?: { account_name: string | null; avatar_url: string | null };
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: '已定时', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', icon: <Clock className="w-3 h-3" /> },
  queued: { label: '排队中', color: 'bg-muted text-muted-foreground', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  running: { label: '提交中', color: 'bg-amber-500/15 text-amber-600 border-amber-500/30', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  done: { label: '全部成功', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> },
  partial: { label: '部分成功', color: 'bg-amber-500/15 text-amber-600 border-amber-500/30', icon: <AlertCircle className="w-3 h-3" /> },
  failed: { label: '全部失败', color: 'bg-destructive/15 text-destructive border-destructive/30', icon: <AlertCircle className="w-3 h-3" /> },
  cancelled: { label: '已取消', color: 'bg-muted text-muted-foreground', icon: <CircleSlash className="w-3 h-3" /> },
};

export default function PublishHistory() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { shopId, loading: shopLoading } = useEffectiveShop();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = async () => {
    if (!shopId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('social-publish-list', { body: { shop_id: shopId, limit: 80 } });
    if (error) toast.error('加载失败: ' + error.message);
    else {
      setJobs((data as any)?.jobs || []);
      setTargets((data as any)?.targets || []);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, [shopId]);

  // 轻量轮询:有 running/scheduled 时每 10s 刷新
  useEffect(() => {
    if (!jobs.some(j => ['scheduled', 'running', 'queued'].includes(j.status))) return;
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, [jobs.map(j => j.id + j.status).join(',')]);

  const targetsByJob = useMemo(() => {
    const m = new Map<string, Target[]>();
    targets.forEach(t => { const arr = m.get(t.job_id) || []; arr.push(t); m.set(t.job_id, arr); });
    return m;
  }, [targets]);

  const retry = async (jobId: string) => {
    setRetrying(jobId);
    const { data, error } = await supabase.functions.invoke('social-publish-retry', { body: { job_id: jobId } });
    setRetrying(null);
    if (error) toast.error('重试失败: ' + error.message);
    else {
      const errs = (data as any)?.errors || [];
      if (errs.length > 0) toast.warning('部分账号仍失败: ' + errs.join(' / '));
      else toast.success('已重新提交');
      void load();
    }
  };

  const cancelScheduled = async (jobId: string) => {
    if (!confirm('确认取消这条定时发布？')) return;
    const { error } = await supabase
      .from('social_publish_jobs').update({ status: 'cancelled' }).eq('id', jobId);
    if (error) toast.error('取消失败');
    else {
      await supabase.from('social_publish_targets').update({ status: 'cancelled' }).eq('job_id', jobId).eq('status', 'scheduled');
      toast.success('已取消');
      void load();
    }
  };

  if (authLoading || shopLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="发布历史" back="/me/marketing/social-accounts" subtitle="所有已发 / 定时 / 失败的任务" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 pb-24 space-y-2">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">还没有发布过任何视频</div>
        ) : (
          jobs.map(j => {
            const ts = targetsByJob.get(j.id) || [];
            const ok = ts.filter(t => t.status === 'success').length;
            const fail = ts.filter(t => t.status === 'failed').length;
            const sm = STATUS_MAP[j.status] || STATUS_MAP.failed;
            const isFuture = j.status === 'scheduled' && j.schedule_at && new Date(j.schedule_at).getTime() > Date.now();
            return (
              <div key={j.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
                <div className="flex gap-3">
                  {j.cover_url ? (
                    <img src={j.cover_url} alt="" className="w-14 h-18 rounded bg-muted object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-18 rounded bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-medium truncate flex-1">{j.title || '未命名'}</p>
                      <Badge variant="outline" className={`text-[10px] ${sm.color} shrink-0 gap-1 px-1.5`}>{sm.icon}{sm.label}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isFuture
                        ? `定时于 ${new Date(j.schedule_at!).toLocaleString('zh-CN', { hour12: false })}`
                        : new Date(j.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                    {ts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {ts.map(t => (
                          <span key={t.id}
                            title={t.error_message || ''}
                            className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
                              t.status === 'success' ? 'bg-emerald-500/10 text-emerald-600'
                              : t.status === 'failed' ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted text-muted-foreground'
                            }`}>
                            {PLATFORM_LABEL[t.platform] || t.platform} · {t.social_accounts?.account_name || '账号'}
                          </span>
                        ))}
                      </div>
                    )}
                    {ts.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">成功 {ok} / 失败 {fail} / 共 {ts.length}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-1.5 pt-1 border-t border-border/50">
                  {fail > 0 && (
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
                      onClick={() => retry(j.id)} disabled={retrying === j.id}>
                      {retrying === j.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                      重试失败 ({fail})
                    </Button>
                  )}
                  {isFuture && (
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
                      onClick={() => cancelScheduled(j.id)}>
                      <CircleSlash className="w-3 h-3 mr-1" />取消定时
                    </Button>
                  )}
                  {j.asset_id && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => navigate(`/me/marketing/publish/${j.asset_id}`)}>
                      <Send className="w-3 h-3 mr-1" />再发
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// 单 job 进度页:轮询 + Realtime,每条 target 显示状态/平台链接/重试
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import { STATUS_COLOR, STATUS_LABEL, type PublishJob, type PublishTarget } from '@/lib/dispatch';

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<PublishJob | null>(null);
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('dispatch-job-status', { body: { job_id: jobId } });
    setLoading(false);
    if (error) { toast({ title: '加载失败', description: error.message, variant: 'destructive' }); return; }
    setJob(data?.job || null); setTargets(data?.targets || []);
  }, [jobId, toast]);

  useEffect(() => { void load(); }, [load]);

  // 5s 轮询,直到全部终态
  useEffect(() => {
    if (!job) return;
    const pending = targets.some((t) => ['queued', 'scheduled', 'running'].includes(t.status));
    if (!pending) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [job, targets, load]);

  // Realtime
  useEffect(() => {
    if (!jobId) return;
    const ch = supabase.channel(`job:${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_publish_targets', filter: `job_id=eq.${jobId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [jobId, load]);

  const retry = async (targetId: string) => {
    setRetrying(targetId);
    const { data, error } = await supabase.functions.invoke('dispatch-job-retry', { body: { target_id: targetId } });
    setRetrying(null);
    if (error || (data as any)?.error) {
      toast({ title: '重试失败', description: (data as any)?.error || error?.message, variant: 'destructive' });
    } else {
      toast({ title: '已重新提交' });
      void load();
    }
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <PageHeader title="发布进度" back="/me/marketing/dispatch?tab=history" right={
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      } />

      {job && (
        <div className="px-4 pt-3 space-y-4">
          {/* job 信息 */}
          <div className="flex gap-3 p-3 bg-card rounded-xl border">
            {job.cover_url ? (
              <img src={job.cover_url} alt="" className="w-16 h-24 rounded-md object-cover" />
            ) : <div className="w-16 h-24 rounded-md bg-muted" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium line-clamp-2">{job.title}</div>
              <div className="mt-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[job.status] || ''}`}>
                  {STATUS_LABEL[job.status] || job.status}
                </span>
              </div>
              {job.schedule_at && (
                <div className="text-[10px] text-muted-foreground mt-1">定时: {new Date(job.schedule_at).toLocaleString('zh-CN')}</div>
              )}
            </div>
          </div>

          {/* targets */}
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground tracking-wider">分平台状态</div>
            {targets.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border">
                <PlatformBadge platform={t.platform} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.account?.account_name || '未命名'}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLOR[t.status] || ''}`}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                    <span>{platformLabel(t.platform)}</span>
                    {t.platform_post_url && (
                      <a href={t.platform_post_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5">
                        查看作品 <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {t.error_message && (
                    <div className="text-[11px] text-rose-600 mt-1 break-all">{t.error_message}</div>
                  )}
                </div>
                {t.status === 'failed' && (
                  <Button size="sm" variant="outline" onClick={() => retry(t.id)} disabled={retrying === t.id}>
                    {retrying === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '重试'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

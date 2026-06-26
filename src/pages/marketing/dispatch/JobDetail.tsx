// 单 job 进度页:轮询 + Realtime,支持取消整单/重试单个/一键重试全部失败,结果横幅展示
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, ExternalLink, Loader2, X, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import { STATUS_COLOR, STATUS_LABEL, type PublishJob, type PublishTarget } from '@/lib/dispatch';

type OpResult = { type: 'success' | 'error'; text: string } | null;

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<PublishJob | null>(null);
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<'cancel' | 'retry' | null>(null);
  const [opResult, setOpResult] = useState<OpResult>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('dispatch-job-status', { body: { job_id: jobId } });
    setLoading(false);
    if (error) { toast({ title: '加载失败', description: error.message, variant: 'destructive' }); return; }
    setJob(data?.job || null); setTargets(data?.targets || []);
  }, [jobId, toast]);

  useEffect(() => { void load(); }, [load]);

  // 5s 轮询,仅在还有非终态 target 时
  useEffect(() => {
    if (!job) return;
    const pending = targets.some((t) => ['queued', 'scheduled', 'running'].includes(t.status));
    if (!pending) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [job, targets, load]);

  // Realtime: targets 任意变更即静默刷新
  useEffect(() => {
    if (!jobId) return;
    const ch = supabase.channel(`job:${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_publish_targets', filter: `job_id=eq.${jobId}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_publish_jobs', filter: `id=eq.${jobId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [jobId, load]);

  const failedTargets = useMemo(() => targets.filter((t) => t.status === 'failed'), [targets]);
  const canCancel = job && ['queued', 'scheduled'].includes(job.status);

  const retry = async (targetId: string) => {
    setRetrying(targetId); setOpResult(null);
    const { data, error } = await supabase.functions.invoke('dispatch-job-retry', { body: { target_id: targetId } });
    setRetrying(null);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      setOpResult({ type: 'error', text: `重试失败: ${errMsg}` });
      toast({ title: '重试失败', description: errMsg, variant: 'destructive' });
    } else {
      setOpResult({ type: 'success', text: '已重新提交' });
      toast({ title: '已重新提交' });
      void load();
    }
  };

  const retryAllFailed = async () => {
    if (failedTargets.length === 0) return;
    setBulkBusy('retry'); setOpResult(null);
    let ok = 0; let fail = 0;
    for (const t of failedTargets) {
      const { data, error } = await supabase.functions.invoke('dispatch-job-retry', { body: { target_id: t.id } });
      if ((data as any)?.error || error) fail++; else ok++;
    }
    setBulkBusy(null);
    const text = `已重试 ${failedTargets.length} 个:成功 ${ok}${fail ? ` · 失败 ${fail}` : ''}`;
    setOpResult({ type: fail === 0 ? 'success' : 'error', text });
    toast({ title: text });
    void load();
  };

  const cancelJob = async () => {
    if (!jobId || !canCancel) return;
    if (!confirm('确定取消整个任务?未派单的目标会停止。')) return;
    setBulkBusy('cancel'); setOpResult(null);
    const { data, error } = await supabase.functions.invoke('dispatch-job-cancel', { body: { job_id: jobId } });
    setBulkBusy(null);
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) {
      setOpResult({ type: 'error', text: `取消失败: ${errMsg}` });
      toast({ title: '取消失败', description: errMsg, variant: 'destructive' });
    } else {
      setOpResult({ type: 'success', text: '任务已取消' });
      toast({ title: '任务已取消' });
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
          {/* 结果横幅 */}
          {opResult && (
            <div
              role="status"
              className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
                opResult.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              {opResult.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <span className="flex-1 break-all">{opResult.text}</span>
              <button onClick={() => setOpResult(null)} className="opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

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

          {/* 一键操作 */}
          {(canCancel || failedTargets.length > 0) && (
            <div className="flex gap-2">
              {canCancel && (
                <Button variant="outline" size="sm" className="flex-1" onClick={cancelJob} disabled={bulkBusy !== null}>
                  {bulkBusy === 'cancel' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
                  取消任务
                </Button>
              )}
              {failedTargets.length > 0 && (
                <Button variant="outline" size="sm" className="flex-1" onClick={retryAllFailed} disabled={bulkBusy !== null}>
                  {bulkBusy === 'retry' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                  重试全部失败({failedTargets.length})
                </Button>
              )}
            </div>
          )}

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
                    {t.retry_count > 0 && <span>· 已重试 {t.retry_count} 次</span>}
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
                  <Button size="sm" variant="outline" onClick={() => retry(t.id)} disabled={retrying === t.id || bulkBusy !== null}>
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

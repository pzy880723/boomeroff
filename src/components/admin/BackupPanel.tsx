import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Loader2, Archive, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

type BackupRun = {
  id: string;
  kind: 'database' | 'storage' | 'full';
  status: 'running' | 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  cos_key: string | null;
  files_count: number;
  total_bytes: number;
  error_message: string | null;
  trigger_source: 'manual' | 'cron';
  metadata?: {
    step?: string;
    phase?: 'database' | 'storage' | 'done';
    table_index?: number;
    database_rows?: number;
    storage_uploaded?: number;
    storage_skipped?: number;
    storage_cursor?: number;
    storage_reached_limit?: boolean;
  } | null;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 把后端的英文/技术报错翻译成"哪一步出问题 + 建议怎么办"。 */
function humanizeError(msg: string | null): string {
  if (!msg) return '';
  const m = msg.toLowerCase();
  if (m.includes('signature') || m.includes('403') || m.includes('accessdenied')) {
    return '腾讯云拒绝了这次写入，多半是密钥过期或权限被改了。建议重新生成腾讯云密钥后再试一次。';
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    return '这次备份跑得太久被中断了。可以直接再点一次"立即备份"，系统会从未完成的地方继续。';
  }
  if (m.includes('nosuchbucket') || m.includes('bucket')) {
    return '找不到腾讯云上对应的存储空间。请确认腾讯云那边的存储桶还在。';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return '连接腾讯云时网络不通，稍等 1 分钟再试一次即可。';
  }
  if (m.includes('worker') || m.includes('timeout') || m.includes('wall clock')) {
    return '这次备份被系统中断了。系统已经记录下来，你可以直接再点一次“立即备份”。';
  }
  return msg;
}

function getProgress(run: BackupRun | undefined) {
  if (!run) return 0;
  if (run.status === 'success') return 100;
  if (run.status === 'failed') return 100;
  if (run.metadata?.phase === 'database') {
    const index = Math.min(run.metadata.table_index ?? 0, 58);
    return Math.max(10, Math.round(10 + (index / 58) * 58));
  }
  if (run.metadata?.phase === 'storage') return 82;
  const step = run.metadata?.step || '';
  if (step.includes('图片') || step.includes('视频')) return 72;
  if (step.includes('系统') || step.includes('记录')) return 38;
  return 16;
}

export function BackupPanel() {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('backup_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(40);
    setLoading(false);
    if (error) {
      toast({ title: '加载失败', description: error.message, variant: 'destructive' });
      return;
    }
    setRuns((data ?? []) as BackupRun[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!runs.some((r) => r.status === 'running')) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [runs, load]);

  const fullRuns = runs.filter((r) => r.kind === 'full');
  const visibleRuns = fullRuns.length ? fullRuns : runs;
  const lastSuccess = visibleRuns.find((r) => r.status === 'success');
  const running = visibleRuns.find((r) => r.status === 'running');
  const latest = visibleRuns[0];
  const progress = getProgress(running);

  useEffect(() => {
    if (!running || continuing) return;
    const t = window.setTimeout(async () => {
      setContinuing(true);
      try {
        await supabase.functions.invoke('backup-all-to-cos', {
          body: { trigger_source: 'manual', continue_run: true },
        });
      } finally {
        setContinuing(false);
        load();
      }
    }, 2500);
    return () => window.clearTimeout(t);
  }, [running, continuing, load]);

  const trigger = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-all-to-cos', {
        body: { trigger_source: 'manual' },
      });
      if (error) throw error;
      toast({
        title: '备份已开始',
        description: '系统会自动把所有数据保存到你的腾讯云。',
      });
      setTimeout(load, 500);
      if (data && (data as { ok?: boolean }).ok) {
        const d = data as { files?: number; bytes?: number; has_more_files?: boolean; completed?: boolean; step?: string };
        toast({
          title: d.completed ? '备份完成' : '备份进行中',
          description: !d.completed
            ? (d.step || '系统正在分批备份，页面会自动继续。')
            : d.has_more_files
              ? `已先备份 ${d.files ?? 0} 个内容，约 ${formatBytes(d.bytes ?? 0)}，剩余图片视频会继续由每天自动备份补齐。`
            : `共备份 ${d.files ?? 0} 个内容，约 ${formatBytes(d.bytes ?? 0)}`,
        });
      }
    } catch (e) {
      toast({
        title: '备份没成功',
        description: humanizeError(e instanceof Error ? e.message : String(e)),
        variant: 'destructive',
      });
    } finally {
      setTriggering(false);
      load();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">数据备份</h2>
          <p className="text-xs text-muted-foreground mt-1">
            系统每天凌晨会自动把全部数据保存到 <span className="font-medium text-foreground">你自己的腾讯云（上海）</span>。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Archive className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">数据自动备份</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">每天自动</Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              账号记录、活动、知识库、营销任务、上传图片和视频都会一起备份。你不用区分类型，后台会自己处理。
            </p>
          </div>
        </div>

        {running ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{running.metadata?.step || '正在备份'}</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {lastSuccess ? (
              <>上次成功：{formatDistanceToNow(new Date(lastSuccess.started_at), { addSuffix: true, locale: zhCN })}
                {' · '}共 {lastSuccess.files_count} 个内容，约 {formatBytes(lastSuccess.total_bytes)}</>
            ) : latest?.status === 'failed' ? (
              <span className="text-destructive">上次备份没成功：{humanizeError(latest.error_message)}</span>
            ) : (
              <span className="text-amber-600">还没成功备份过，可以先点一次“立即备份”。</span>
            )}
          </div>
        )}

        <Button size="sm" onClick={trigger} disabled={triggering || Boolean(running)} className="w-full">
          {triggering || running ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />备份中，请稍等…</>
          ) : (
            '立即备份'
          )}
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 text-sm font-medium">
          最近 40 次备份记录
        </div>
        <div className="divide-y divide-border/40">
          {runs.length === 0 && !loading && (
            <div className="p-6 text-center text-sm text-muted-foreground">还没有备份记录</div>
          )}
          {visibleRuns.map((r) => {
            const StatusIcon = r.status === 'success' ? CheckCircle2
              : r.status === 'failed' ? XCircle : Clock;
            const statusColor = r.status === 'success' ? 'text-emerald-600'
              : r.status === 'failed' ? 'text-destructive' : 'text-amber-600';
            const statusLabel = r.status === 'success' ? '成功'
              : r.status === 'failed' ? '失败' : '进行中';
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${statusColor} ${r.status === 'running' ? 'animate-spin' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">数据备份</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {r.trigger_source === 'cron' ? '系统自动' : '手动触发'}
                    </Badge>
                    <span className={`text-[11px] ${statusColor}`}>{statusLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: zhCN })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.metadata?.step && r.status === 'running' ? `${r.metadata.step} · ` : ''}
                    共 {r.files_count} 个内容，约 {formatBytes(r.total_bytes)}
                  </div>
                  {r.metadata?.storage_reached_limit && r.status === 'success' && (
                    <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                      图片视频很多，本次已先备份一部分；每天自动备份会继续补齐，已备份过的不会重复传。
                    </p>
                  )}
                  {r.error_message && (
                    <p className="mt-1 text-[11px] text-destructive leading-relaxed">
                      {humanizeError(r.error_message)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

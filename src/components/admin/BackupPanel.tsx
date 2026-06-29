import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, Database, HardDrive, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

type BackupRun = {
  id: string;
  kind: 'database' | 'storage';
  status: 'running' | 'success' | 'failed';
  started_at: string;
  finished_at: string | null;
  cos_key: string | null;
  files_count: number;
  total_bytes: number;
  error_message: string | null;
  trigger_source: 'manual' | 'cron';
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function BackupPanel() {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState<null | 'database' | 'storage'>(null);

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

  // Light polling while any run is in-flight.
  useEffect(() => {
    if (!runs.some((r) => r.status === 'running')) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [runs, load]);

  const trigger = async (kind: 'database' | 'storage') => {
    setTriggering(kind);
    try {
      const fn = kind === 'database' ? 'backup-database-to-cos' : 'backup-storage-to-cos';
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { trigger_source: 'manual' },
      });
      if (error) throw error;
      toast({
        title: '备份已启动',
        description: kind === 'database' ? '数据库全量导出中…' : 'Storage 增量同步中…',
      });
      // Refresh quickly so the new running row appears.
      setTimeout(load, 500);
      // Show final summary if returned synchronously.
      if (data && (data as { ok?: boolean }).ok) {
        const d = data as { files?: number; uploaded?: number; bytes?: number };
        const count = d.files ?? d.uploaded ?? 0;
        toast({ title: '备份完成', description: `${count} 个文件 · ${formatBytes(d.bytes ?? 0)}` });
      }
    } catch (e) {
      toast({
        title: '备份触发失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setTriggering(null);
      load();
    }
  };

  const lastBy = (kind: 'database' | 'storage') =>
    runs.find((r) => r.kind === kind && r.status === 'success');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">数据备份 · 腾讯云 COS</h2>
          <p className="text-xs text-muted-foreground mt-1">
            备份目标：<code className="text-[11px]">lovable-backup-1257117127 · ap-shanghai</code>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['database', 'storage'] as const).map((kind) => {
          const last = lastBy(kind);
          const Icon = kind === 'database' ? Database : HardDrive;
          return (
            <Card key={kind} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">
                  {kind === 'database' ? '数据库全量导出' : 'Storage 增量镜像'}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {kind === 'database'
                  ? '把所有业务表导出为 JSONL.gz，每天写入 db-backups/daily/。'
                  : '按 ETag 对比已镜像文件，仅上传新增/变化项至 storage-mirror/。'}
              </p>
              <div className="text-xs text-muted-foreground">
                {last ? (
                  <>上次成功：{formatDistanceToNow(new Date(last.started_at), { addSuffix: true, locale: zhCN })}
                    {' · '}{last.files_count} 个文件 · {formatBytes(last.total_bytes)}</>
                ) : (
                  <span className="text-amber-600">尚未成功执行过</span>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => trigger(kind)}
                disabled={triggering !== null}
                className="w-full"
              >
                {triggering === kind ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />执行中…</>
                ) : (
                  '立即备份'
                )}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 text-sm font-medium">
          最近 40 次备份记录
        </div>
        <div className="divide-y divide-border/40">
          {runs.length === 0 && !loading && (
            <div className="p-6 text-center text-sm text-muted-foreground">暂无记录</div>
          )}
          {runs.map((r) => {
            const StatusIcon = r.status === 'success' ? CheckCircle2
              : r.status === 'failed' ? XCircle : Clock;
            const statusColor = r.status === 'success' ? 'text-emerald-600'
              : r.status === 'failed' ? 'text-destructive' : 'text-amber-600';
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${statusColor} ${r.status === 'running' ? 'animate-spin' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">
                      {r.kind === 'database' ? '数据库' : 'Storage'}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {r.trigger_source === 'cron' ? '定时' : '手动'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: zhCN })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.files_count} 个文件 · {formatBytes(r.total_bytes)}
                    {r.cos_key && <> · <code className="text-[11px]">{r.cos_key}</code></>}
                  </div>
                  {r.error_message && (
                    <pre className="mt-1 text-[11px] text-destructive whitespace-pre-wrap break-all">
                      {r.error_message}
                    </pre>
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

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, FileText, ImageIcon, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
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

const KIND_LABEL: Record<'database' | 'storage', string> = {
  database: '文字数据',
  storage: '图片视频',
};

/** 把后端的英文/技术报错翻译成"哪一步出问题 + 建议怎么办"。 */
function humanizeError(msg: string): string {
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
  return msg;
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
        title: '备份已开始',
        description: kind === 'database' ? '正在打包文字数据…' : '正在上传图片视频…',
      });
      setTimeout(load, 500);
      if (data && (data as { ok?: boolean }).ok) {
        const d = data as { files?: number; uploaded?: number; bytes?: number };
        const count = d.files ?? d.uploaded ?? 0;
        toast({ title: '备份完成', description: `共备份 ${count} 个文件，约 ${formatBytes(d.bytes ?? 0)}` });
      }
    } catch (e) {
      toast({
        title: '备份没成功',
        description: humanizeError(e instanceof Error ? e.message : String(e)),
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
          <h2 className="text-base font-semibold">数据备份</h2>
          <p className="text-xs text-muted-foreground mt-1">
            所有备份都会保存到 <span className="font-medium text-foreground">你自己的腾讯云（上海）</span>，
            就算这边出问题，数据也还在你手上。
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
          const Icon = kind === 'database' ? FileText : ImageIcon;
          const title = kind === 'database' ? '文字数据备份' : '图片视频备份';
          const desc = kind === 'database'
            ? '把店里所有账号、识别记录、知识库、活动报名等文字内容打包保存一份。体积很小，建议每天点一次。'
            : '把大家上传到系统里的所有照片和视频复制一份到你的腾讯云。第一次会久一点，之后只传新增的，很快。';
          return (
            <Card key={kind} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              <div className="text-xs text-muted-foreground">
                {last ? (
                  <>上次成功：{formatDistanceToNow(new Date(last.started_at), { addSuffix: true, locale: zhCN })}
                    {' · '}共 {last.files_count} 个文件，约 {formatBytes(last.total_bytes)}</>
                ) : (
                  <span className="text-amber-600">还没成功备份过，先手动点一次试试</span>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => trigger(kind)}
                disabled={triggering !== null}
                className="w-full"
              >
                {triggering === kind ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />备份中，请稍等…</>
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
            <div className="p-6 text-center text-sm text-muted-foreground">还没有备份记录</div>
          )}
          {runs.map((r) => {
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
                    <span className="font-medium">{KIND_LABEL[r.kind]}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {r.trigger_source === 'cron' ? '系统自动' : '手动触发'}
                    </Badge>
                    <span className={`text-[11px] ${statusColor}`}>{statusLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: zhCN })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    共 {r.files_count} 个文件，约 {formatBytes(r.total_bytes)}
                  </div>
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

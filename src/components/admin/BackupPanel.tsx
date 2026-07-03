import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { Loader2, Archive, CheckCircle2, XCircle, Clock, RefreshCw, Download, RotateCw, FileCheck2, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

type PassStat = { uploaded: number; failed: number; skipped: number; bytes: number; elapsed_ms: number; total?: number };
type FailureItem = {
  kind: 'table' | 'storage';
  bucket?: string; path?: string; table?: string; offset?: number; size?: number;
  error: string; attempts: number; first_failed_at: string; last_failed_at: string;
};
type ReconcileMeta = {
  ran_at: string; tables_expected: number; tables_present: number; tables_missing: string[];
  storage_expected: number; storage_present: number; storage_missing: Array<{ bucket: string; path: string }>;
  ok: boolean;
};

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
  retry_of?: string | null;
  metadata?: {
    step?: string;
    phase?: 'database' | 'storage_list' | 'storage' | 'finalize' | 'done';
    storage_pass?: 1 | 2;
    storage_cursor?: number;
    storage_total?: number;
    pass_stats?: {
      database?: PassStat;
      storage_pass1?: PassStat;
      storage_pass2?: PassStat;
    };
    failures?: FailureItem[];
    manifest_key?: string;
    reconcile?: ReconcileMeta;
    last_tick_at?: string;
  } | null;
};

function formatBytes(n: number) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function formatMs(ms: number) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); const rest = s - m * 60;
  return `${m}m${rest ? ` ${rest}s` : ''}`;
}
function humanizeError(msg: string | null): string {
  if (!msg) return '';
  const m = msg.toLowerCase();
  if (m.includes('signature') || m.includes('403') || m.includes('accessdenied')) return '腾讯云拒绝写入，密钥可能过期或权限被改。请重新生成腾讯云密钥。';
  if (m.includes('等待过久') || m.includes('分批补传')) return '腾讯云连接慢，系统会分批补传；这种情况通常不用去腾讯云开按钮。';
  if (m.includes('timeout') || m.includes('timed out')) return '腾讯云连接超时，系统会从未完成的地方继续；如果连续多次失败，再检查腾讯云密钥和桶权限。';
  if (m.includes('nosuchbucket') || m.includes('bucket')) return '找不到腾讯云上对应的存储空间。';
  if (m.includes('network') || m.includes('fetch')) return '连接腾讯云时网络不通，稍等 1 分钟再试即可。';
  return msg;
}

function PassRow({ label, stat, active }: { label: string; stat?: PassStat; active?: boolean }) {
  const total = stat?.total ?? 0;
  const done = (stat?.uploaded ?? 0) + (stat?.skipped ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (stat?.uploaded ? 100 : 0);
  return (
    <div className={`space-y-1 ${active ? '' : 'opacity-80'}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {done}/{total || '—'} · 成功 {stat?.uploaded ?? 0} · 失败 <span className={stat?.failed ? 'text-destructive font-medium' : ''}>{stat?.failed ?? 0}</span> · {formatMs(stat?.elapsed_ms ?? 0)}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

export function BackupPanel() {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [showFailures, setShowFailures] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [ledgerCount, setLedgerCount] = useState<number | null>(null);
  const [pendingFailures, setPendingFailures] = useState<number>(0);

  const loadLedgerStats = useCallback(async () => {
    const [{ count: lc }, { count: fc }] = await Promise.all([
      supabase.from('backup_file_ledger').select('*', { count: 'exact', head: true }),
      supabase.from('backup_file_failures').select('*', { count: 'exact', head: true }).is('resolved_at', null),
    ]);
    setLedgerCount(lc ?? 0);
    setPendingFailures(fc ?? 0);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('backup_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(40);
    setLoading(false);
    if (error) { toast({ title: '加载失败', description: error.message, variant: 'destructive' }); return; }
    setRuns((data ?? []) as BackupRun[]);
    loadLedgerStats();
  }, [loadLedgerStats]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!runs.some((r) => r.status === 'running')) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [runs, load]);


  // Realtime toast on new backup notifications
  useEffect(() => {
    const ch = supabase.channel('backup-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'type=eq.backup' }, (payload) => {
        const row = payload.new as { title?: string; body?: string };
        toast({ title: row.title ?? '备份消息', description: row.body ?? '' });
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const fullRuns = useMemo(() => runs.filter((r) => r.kind === 'full'), [runs]);
  const visibleRuns = fullRuns.length ? fullRuns : runs;
  const running = visibleRuns.find((r) => r.status === 'running');
  const latest = visibleRuns[0];
  const focus = running ?? latest;

  // Low-frequency safety nudge: backend normally continues itself; this only
  // wakes a run that has not written progress for about a minute.
  useEffect(() => {
    if (!running || nudging) return;
    const lastTick = running.metadata?.last_tick_at ?? running.started_at;
    const staleMs = Date.now() - new Date(lastTick).getTime();
    if (staleMs < 55_000) return;
    const t = window.setTimeout(async () => {
      setNudging(true);
      try {
        await supabase.functions.invoke('backup-all-to-cos', { body: { trigger_source: 'manual' } });
      } finally { setNudging(false); load(); }
    }, 10_000);
    return () => window.clearTimeout(t);
  }, [running, nudging, load]);

  const trigger = async () => {
    setTriggering(true);
    try {
      const { error } = await supabase.functions.invoke('backup-all-to-cos', { body: { trigger_source: 'manual' } });
      if (error) throw error;
      toast({ title: '备份已开始', description: '系统会自动把所有数据保存到你的腾讯云。' });
      setTimeout(load, 500);
    } catch (e) {
      toast({ title: '备份没成功', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    } finally { setTriggering(false); load(); }
  };

  const stopRunning = async () => {
    setStopping(true);
    try {
      const { error } = await supabase.functions.invoke('backup-all-to-cos', { body: { action: 'cancel_running' } });
      if (error) throw error;
      toast({ title: '已停止备份', description: '当前卡住的备份已结束，可以重新开始。' });
    } catch (e) {
      toast({ title: '停止失败', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    } finally { setStopping(false); load(); }
  };

  const restartFresh = async () => {
    setTriggering(true);
    try {
      const { error } = await supabase.functions.invoke('backup-all-to-cos', { body: { action: 'start_fresh', trigger_source: 'manual' } });
      if (error) throw error;
      toast({ title: '已重新开始', description: '旧备份已停止，新备份会从头检查并继续跑。' });
      setTimeout(load, 500);
    } catch (e) {
      toast({ title: '重新开始失败', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    } finally { setTriggering(false); load(); }
  };

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-all-to-cos', {
        body: { action: 'retry_failed' },
      });
      if (error) throw error;
      const d = data as { queued?: number };
      toast({ title: '已开始补传', description: `准备重传 ${d?.queued ?? 0} 个失败的文件。` });
    } catch (e) {
      toast({ title: '补传失败', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    } finally { setRetrying(false); load(); }
  };

  const bootstrapLedger = async () => {
    setBootstrapping(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-all-to-cos', {
        body: { action: 'bootstrap_ledger' },
      });
      if (error) throw error;
      const d = data as { ledger_rows?: number };
      toast({ title: '台账已同步', description: `已录入 ${d?.ledger_rows ?? 0} 个已成功备份的文件，后续不再重复上传。` });
    } catch (e) {
      toast({ title: '同步失败', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    } finally { setBootstrapping(false); load(); }
  };


  const reconcile = async () => {
    if (!focus) return;
    setReconciling(true);
    try {
      const { error } = await supabase.functions.invoke('backup-all-to-cos', {
        body: { action: 'reconcile_only', run_id: focus.id },
      });
      if (error) throw error;
      toast({ title: '对账完成', description: '已重新核对文件清单。' });
    } catch (e) {
      toast({ title: '对账失败', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    } finally { setReconciling(false); load(); }
  };

  const downloadManifest = async () => {
    if (!focus) return;
    try {
      const { data, error } = await supabase.functions.invoke('get-backup-manifest-url', { body: { run_id: focus.id } });
      if (error) throw error;
      const d = data as { url?: string; error?: string };
      if (d.url) { window.open(d.url, '_blank'); }
      else { throw new Error(d.error || '没有清单文件'); }
    } catch (e) {
      toast({ title: '拿不到清单', description: humanizeError(e instanceof Error ? e.message : String(e)), variant: 'destructive' });
    }
  };

  const meta = focus?.metadata ?? undefined;
  const stats = meta?.pass_stats;
  const failures = meta?.failures ?? [];
  const reconcileInfo = meta?.reconcile;
  const successRate = focus && focus.files_count > 0
    ? Math.round(((focus.files_count - failures.length) / (focus.files_count + failures.length)) * 100)
    : null;
  const elapsedMs = focus?.finished_at
    ? new Date(focus.finished_at).getTime() - new Date(focus.started_at).getTime()
    : focus ? Date.now() - new Date(focus.started_at).getTime() : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">数据备份</h2>
          <p className="text-xs text-muted-foreground mt-1">
            系统每天凌晨会自动把全部数据保存到 <span className="font-medium text-foreground">你自己的腾讯云（上海）</span>。
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            已启用腾讯云 <span className="font-medium text-foreground">全球加速</span> 上传通道，跨境延迟已优化。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Persistent ledger stats — the truth source of "已成功备份" */}
      <Card className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs">
          <span className="text-muted-foreground">累计已备份文件：</span>
          <span className="font-semibold text-foreground tabular-nums">{ledgerCount ?? '—'}</span>
          <span className="mx-2 text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">待重试失败：</span>
          <span className={`font-semibold tabular-nums ${pendingFailures > 0 ? 'text-destructive' : 'text-foreground'}`}>{pendingFailures}</span>
          <p className="text-[11px] text-muted-foreground mt-1">
            台账会记录每个已成功上传到腾讯云的文件，下次备份会直接跳过；只有台账里没有或大小对不上的文件才会重新上传。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={retryFailed} disabled={retrying || pendingFailures === 0}>
            <RotateCw className={`w-4 h-4 mr-1.5 ${retrying ? 'animate-spin' : ''}`} />
            重试全部失败{pendingFailures > 0 ? `（${pendingFailures}）` : ''}
          </Button>
          <Button size="sm" variant="outline" onClick={bootstrapLedger} disabled={bootstrapping}>
            <FileCheck2 className={`w-4 h-4 mr-1.5 ${bootstrapping ? 'animate-spin' : ''}`} />
            同步已备份清单
          </Button>
        </div>
      </Card>



      {/* Focus card: current run or last run */}
      {focus && (
        <Card className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">
                  {focus.status === 'running' ? '本次备份进行中' : focus.status === 'success' ? '上次备份' : '上次备份未完成'}
                </h3>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {focus.trigger_source === 'cron' ? '系统自动' : '手动触发'}
                </Badge>
                {focus.retry_of && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">补传</Badge>}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(focus.started_at), { addSuffix: true, locale: zhCN })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {meta?.step ?? '—'} · 共 {focus.files_count} 个 · {formatBytes(focus.total_bytes)} · 耗时 {formatMs(elapsedMs)}
                {successRate !== null && <> · 成功率 <span className="font-medium text-foreground">{successRate}%</span></>}
              </p>
            </div>
          </div>

          {/* Three-pass progress */}
          <div className="space-y-3">
            <PassRow label="数据库表" stat={stats?.database} active={meta?.phase === 'database'} />
            <PassRow label="图片" stat={stats?.storage_pass1} active={meta?.phase === 'storage' && meta?.storage_pass !== 2} />
            <PassRow label="视频" stat={stats?.storage_pass2} active={meta?.phase === 'storage' && meta?.storage_pass === 2} />
          </div>

          {/* Reconcile */}
          {reconcileInfo && (
            <div className={`rounded-md border px-3 py-2 text-xs ${reconcileInfo.ok ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900' : 'bg-destructive/10 border-destructive/30'}`}>
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-3.5 h-3.5" />
                {reconcileInfo.ok ? (
                  <span>对账通过：表 {reconcileInfo.tables_present}/{reconcileInfo.tables_expected} · 文件 {reconcileInfo.storage_present}/{reconcileInfo.storage_expected}</span>
                ) : (
                  <span className="text-destructive font-medium">
                    对账发现缺失：表少 {reconcileInfo.tables_missing.length} 个，文件少 {reconcileInfo.storage_missing.length} 个
                  </span>
                )}
                {(!reconcileInfo.ok && (reconcileInfo.tables_missing.length + reconcileInfo.storage_missing.length > 0)) && (
                  <button className="ml-auto underline" onClick={() => setShowMissing((v) => !v)}>
                    {showMissing ? '收起' : '查看缺失'}
                  </button>
                )}
              </div>
              {showMissing && !reconcileInfo.ok && (
                <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                  {reconcileInfo.tables_missing.map((t) => (
                    <div key={t} className="text-[11px] font-mono">表：{t}</div>
                  ))}
                  {reconcileInfo.storage_missing.map((f) => (
                    <div key={f.bucket + f.path} className="text-[11px] font-mono truncate">{f.bucket}/{f.path}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Failures */}
          {failures.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive font-medium"
                onClick={() => setShowFailures((v) => !v)}
              >
                {showFailures ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                失败 {failures.length} 个 · 点击展开
              </button>
              {showFailures && (
                <div className="max-h-64 overflow-auto divide-y divide-destructive/20">
                  <div className="px-3 py-2 text-[11px] text-muted-foreground bg-background/60">
                    小图片超时通常是腾讯云链路慢，系统会分批补传；只有出现“拒绝写入/桶不存在”才需要去腾讯云检查权限。
                  </div>
                  {failures.slice(0, 100).map((f, i) => (
                    <div key={i} className="px-3 py-1.5 text-[11px]">
                      <div className="font-mono truncate">
                        {f.kind === 'table' ? `表 ${f.table}${f.offset ? `@${f.offset}` : ''}` : `${f.bucket}/${f.path}`}
                      </div>
                      <div className="text-destructive/80">{f.error} · 尝试 {f.attempts} 次</div>
                    </div>
                  ))}
                  {failures.length > 100 && (
                    <div className="px-3 py-1.5 text-[11px] text-muted-foreground">仅显示前 100 条，共 {failures.length} 条。清单会导出全部。</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={trigger} disabled={triggering || Boolean(running)}>
              {triggering || running ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />备份中…</> : '立即备份'}
            </Button>
            {running && (
              <Button size="sm" variant="destructive" onClick={stopRunning} disabled={stopping}>
                {stopping ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <XCircle className="w-4 h-4 mr-1.5" />}
                停止当前备份
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={restartFresh} disabled={triggering || stopping}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${triggering ? 'animate-spin' : ''}`} />
              停止并重新开始
            </Button>
            <Button size="sm" variant="outline" onClick={reconcile} disabled={reconciling || Boolean(running)}>
              <FileCheck2 className={`w-4 h-4 mr-1.5 ${reconciling ? 'animate-spin' : ''}`} />
              重新对账
            </Button>
            <Button size="sm" variant="outline" onClick={downloadManifest} disabled={!meta?.manifest_key || Boolean(running)}>
              <Download className="w-4 h-4 mr-1.5" />
              下载清单
            </Button>
          </div>
        </Card>
      )}

      {/* Recent runs history */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 text-sm font-medium">
          最近 40 次备份记录
        </div>
        <div className="divide-y divide-border/40">
          {runs.length === 0 && !loading && (
            <div className="p-6 text-center text-sm text-muted-foreground">还没有备份记录</div>
          )}
          {visibleRuns.map((r) => {
            const StatusIcon = r.status === 'success' ? CheckCircle2 : r.status === 'failed' ? XCircle : Clock;
            const statusColor = r.status === 'success' ? 'text-emerald-600' : r.status === 'failed' ? 'text-destructive' : 'text-amber-600';
            const statusLabel = r.status === 'success' ? '成功' : r.status === 'failed' ? '失败' : '进行中';
            const rf = r.metadata?.failures?.length ?? 0;
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${statusColor} ${r.status === 'running' ? 'animate-spin' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">数据备份</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {r.trigger_source === 'cron' ? '系统自动' : '手动触发'}
                    </Badge>
                    {r.retry_of && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">补传</Badge>}
                    <span className={`text-[11px] ${statusColor}`}>{statusLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: zhCN })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    共 {r.files_count} 个 · {formatBytes(r.total_bytes)}
                    {rf > 0 && <span className="text-destructive"> · 失败 {rf}</span>}
                    {r.metadata?.reconcile && (
                      <span className={r.metadata.reconcile.ok ? '' : 'text-destructive'}>
                        {' '}· 对账 {r.metadata.reconcile.ok ? '通过' : '有缺失'}
                      </span>
                    )}
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

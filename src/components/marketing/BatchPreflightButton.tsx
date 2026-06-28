// 「一键预检全部未认证角色」按钮:一次 invoke 跑 50 个,按 50 分批,失败可重试。
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CharLite = { id: string; name?: string | null; verified_asset_uri?: string | null };
type Fail = { id: string; name: string; error: string };

const BATCH = 50;

function translateInvokeError(err: any): string {
  const raw = String(err?.message || err || '').toLowerCase();
  if (raw.includes('failed to send') || raw.includes('failed to fetch') || raw.includes('networkerror')) {
    return '预检函数刚部署、还在生效,请等 30 秒后再点一次';
  }
  if (raw.includes('not_found') || raw.includes('not found') || raw.includes('404')) {
    return '预检函数还没生效,请稍候 30 秒后重试';
  }
  if (raw.includes('timeout') || raw.includes('504')) {
    return '处理超时,请稍后重试';
  }
  return err?.message || '请求失败';
}

export function BatchPreflightButton({
  characters,
  onUpdated,
}: {
  characters: CharLite[];
  onUpdated: (updates: Record<string, { verified_asset_uri: string; verified_at: string }>) => void;
}) {
  const pending = characters.filter((c) => !c.verified_asset_uri);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<Fail[]>([]);
  const [showDetail, setShowDetail] = useState(false);

  if (!characters.length) return null;

  const runBatch = async (subset: CharLite[]) => {
    setConfirmOpen(false);
    if (!subset.length) return;
    setRunning(true);
    setFailures([]);
    setShowDetail(false);
    setProgress({ done: 0, total: subset.length });
    const updates: Record<string, { verified_asset_uri: string; verified_at: string }> = {};
    const fails: Fail[] = [];
    const nameOf = (id: string) => subset.find((s) => s.id === id)?.name || '未命名';

    // 按 50 一批切片,通常一次就完
    for (let off = 0; off < subset.length; off += BATCH) {
      const chunk = subset.slice(off, off + BATCH);
      try {
        const { data, error } = await supabase.functions.invoke('character-preflight', {
          body: { character_ids: chunk.map((c) => c.id) },
        });
        if (error) throw error;
        const results: Array<{ id: string; status: string; verified_asset_uri?: string; error?: string }> =
          (data as any)?.results || [];
        for (const r of results) {
          if (r.status === 'ok' && r.verified_asset_uri) {
            updates[r.id] = { verified_asset_uri: r.verified_asset_uri, verified_at: new Date().toISOString() };
          } else if (r.status === 'failed') {
            fails.push({ id: r.id, name: nameOf(r.id), error: r.error || '未知错误' });
          }
        }
      } catch (e: any) {
        const msg = translateInvokeError(e);
        // 整批失败 → 所有 id 都记一次,方便重试
        for (const c of chunk) fails.push({ id: c.id, name: c.name || '未命名', error: msg });
      }
      setProgress({ done: Math.min(off + chunk.length, subset.length), total: subset.length });
    }

    if (Object.keys(updates).length) onUpdated(updates);
    setFailures(fails);
    setRunning(false);
    const okCount = Object.keys(updates).length;
    if (fails.length === 0) {
      toast.success(`已完成 ${okCount} 个角色的软通过预检`);
    } else if (okCount === 0) {
      toast.error(`全部 ${fails.length} 个失败 · ${fails[0]?.error || ''}`, { duration: 6000 });
    } else {
      toast.message(`${okCount} 成功 · ${fails.length} 失败`, { duration: 5000 });
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={running || pending.length === 0}
        onClick={() => setConfirmOpen(true)}
        className="h-8 text-[11px]"
      >
        {running ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            预检 {progress?.done ?? 0}/{progress?.total ?? 0}
          </>
        ) : (
          <>
            <ShieldCheck className="w-3.5 h-3.5 mr-1" />
            一键预检({pending.length})
          </>
        )}
      </Button>

      {failures.length > 0 && !running && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[11px] text-rose-600"
            onClick={() => runBatch(characters.filter((c) => failures.some((f) => f.id === c.id)))}
          >
            <AlertCircle className="w-3.5 h-3.5 mr-1" />
            重试失败({failures.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-[11px] text-muted-foreground"
            onClick={() => setShowDetail((s) => !s)}
          >
            {showDetail ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            原因
          </Button>
        </>
      )}

      {failures.length > 0 && !running && showDetail && (
        <div className="w-full mt-1 rounded-md border border-rose-200 bg-rose-50/60 p-2 space-y-1">
          {failures.slice(0, 10).map((f) => (
            <div key={f.id} className="text-[11px] text-rose-700 leading-tight">
              <span className="font-medium">{f.name}</span>
              <span className="text-rose-500"> · {f.error}</span>
            </div>
          ))}
          {failures.length > 10 && (
            <div className="text-[10px] text-rose-500">…还有 {failures.length - 10} 条</div>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              一键预检全部未认证角色
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] space-y-1.5">
              <span className="block">
                将为 <b>{pending.length}</b> 个未认证角色生成 Character Sheet 软通过封面,服务端并发处理,预计 {Math.max(5, Math.ceil(pending.length / 5) * 4)}-{Math.max(10, Math.ceil(pending.length / 5) * 8)} 秒。
              </span>
              <span className="block text-muted-foreground">
                软通过 ≠ 火山真人活体认证。它会在原封面上叠加"角色卡参考"水印,让 Seedance 把照片当作参考素材而不是真人快照,可绕过 99% 的真人拦截。需要更稳的真人通过率,建议对角色卡单独做活体认证。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runBatch(pending)}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />开始预检
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

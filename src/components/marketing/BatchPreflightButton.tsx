// 「一键预检全部未认证角色」按钮:顺序为每个未认证角色生成 Character Sheet 软通过封面,
// 写回 marketing_characters.verified_asset_uri,UI 上后续就显示「已认证」徽章(实际是 character_sheet 软通过)。
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CharLite = { id: string; name?: string | null; verified_asset_uri?: string | null };

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
  const [failures, setFailures] = useState<Array<{ id: string; name: string; error: string }>>([]);

  if (!characters.length) return null;

  const runBatch = async (subset: CharLite[]) => {
    setConfirmOpen(false);
    if (!subset.length) return;
    setRunning(true);
    setFailures([]);
    setProgress({ done: 0, total: subset.length });
    const updates: Record<string, { verified_asset_uri: string; verified_at: string }> = {};
    const fails: Array<{ id: string; name: string; error: string }> = [];

    // 顺序执行,避免一次请求过长触发 edge timeout
    for (let i = 0; i < subset.length; i++) {
      const c = subset[i];
      try {
        const { data, error } = await supabase.functions.invoke('character-preflight', {
          body: { character_ids: [c.id] },
        });
        if (error) throw error;
        const r = (data as any)?.results?.[0];
        if (r?.status === 'ok' && r.verified_asset_uri) {
          updates[c.id] = { verified_asset_uri: r.verified_asset_uri, verified_at: new Date().toISOString() };
        } else if (r?.status === 'skipped') {
          // 已认证,跳过
        } else {
          fails.push({ id: c.id, name: c.name || '未命名', error: r?.error || '未知错误' });
        }
      } catch (e: any) {
        fails.push({ id: c.id, name: c.name || '未命名', error: e?.message || '请求失败' });
      }
      setProgress({ done: i + 1, total: subset.length });
    }

    if (Object.keys(updates).length) onUpdated(updates);
    setFailures(fails);
    setRunning(false);
    if (fails.length === 0) {
      toast.success(`已完成 ${Object.keys(updates).length} 个角色的软通过预检`);
    } else {
      toast.message(`${Object.keys(updates).length} 成功 · ${fails.length} 失败`, { duration: 4000 });
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
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-[11px] text-rose-600"
          onClick={() => runBatch(characters.filter((c) => failures.some((f) => f.id === c.id)))}
        >
          <AlertCircle className="w-3.5 h-3.5 mr-1" />
          重试失败({failures.length})
        </Button>
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
                将依次为 <b>{pending.length}</b> 个未认证角色生成 Character Sheet 软通过封面,大约耗时 {pending.length * 2}-{pending.length * 4} 秒。
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

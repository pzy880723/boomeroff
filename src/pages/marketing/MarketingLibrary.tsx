import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Loader2, Image as ImageIcon, FileText, Video, Trash2, Check, Pencil, Store, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AssetDetailDialog, copyPreview } from '@/components/marketing/AssetDetailDialog';
import { ShopFilterChips } from '@/components/marketing/ShopPicker';
import { ShopProfilePanel } from '@/components/marketing/ShopProfilePanel';
import { useShops, recallShop, rememberShop } from '@/hooks/useShops';

export default function MarketingLibrary() {
  const { user } = useAuth();
  const { shops } = useShops();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageMode, setManageMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [shopFilter, setShopFilter] = useState<string | null | 'unassigned'>(() => recallShop() as any);
  const [tab, setTab] = useState<'assets' | 'profile'>('assets');

  const shopName = (id?: string | null) => shops.find((s) => s.id === id)?.name || '未分类';

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('marketing_assets' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(120);
    setItems((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  // 轮询未完成的视频任务
  useEffect(() => {
    const pending = items.filter(
      (it) => it.kind === 'video' && it.meta?.job_id && !['succeeded', 'failed'].includes(it.meta?.status),
    );
    if (!pending.length) return;
    let cancelled = false;
    const tick = async () => {
      for (const it of pending) {
        if (cancelled) return;
        try {
          const { data } = await supabase.functions.invoke('poll-marketing-video', {
            body: { job_id: it.meta.job_id },
          });
          const next = data as any;
          if (next?.status && next.status !== it.meta?.status) {
            setItems((prev) => prev.map((x) => x.id === it.id ? {
              ...x,
              output_url: next.video_url || x.output_url,
              meta: { ...(x.meta || {}), status: next.status, error: next.error || undefined },
            } : x));
          }
        } catch (_e) { /* ignore */ }
      }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [items]);

  const statusLabel = (s?: string) => ({
    queued: '排队中', running: '渲染中', succeeded: '已完成', failed: '失败',
  } as Record<string, string>)[s || ''] || s || '排队中';

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    const now = new Date();
    const thisYM = `${now.getFullYear()}-${now.getMonth()}`;
    items.forEach((it) => {
      const d = new Date(it.created_at);
      const ym = `${d.getFullYear()}-${d.getMonth()}`;
      const key = ym === thisYM
        ? '本月'
        : `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} 月`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries());
  }, [items]);

  const toggleSel = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const exitManage = () => { setManageMode(false); setSelected(new Set()); };
  const doDelete = async () => {
    if (!selected.size) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from('marketing_assets' as any).delete().in('id', ids);
    setDeleting(false);
    setConfirmDel(false);
    if (error) { toast.error(error.message || '删除失败'); return; }
    setItems((prev) => prev.filter((it) => !selected.has(it.id)));
    exitManage();
    toast.success(`已删除 ${ids.length} 条`);
  };

  return (
    <>
      <PageHeader title="素材库" back="/me/marketing" subtitle="营销中心 / 历史产出" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        {/* 顶部操作条 */}
        {!loading && items.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-muted-foreground">共 {items.length} 条</span>
            {manageMode ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-accent font-semibold">已选 {selected.size}</span>
                <Button size="sm" variant="outline" onClick={exitManage}>取消</Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmDel(true)} disabled={!selected.size}>
                  <Trash2 className="w-3.5 h-3.5" />删除
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setManageMode(true)}>
                <Pencil className="w-3.5 h-3.5" />管理
              </Button>
            )}
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">还没有产出</p>
        )}

        {groups.map(([key, list]) => (
          <section key={key} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="w-1 h-1 rounded-full bg-accent" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{key}</span>
              <span className="text-[10px] text-muted-foreground ml-1">{list.length} 条</span>
              <span className="flex-1 h-px bg-border ml-2" />
            </div>
            {list.map((it) => {
              const checked = selected.has(it.id);
              return (
                <div
                  key={it.id}
                  onClick={() => {
                    if (manageMode) toggleSel(it.id);
                    else setDetail(it);
                  }}
                  className={[
                    'bg-card rounded-[0.875rem] border shadow-sm p-3 flex gap-3 transition-colors cursor-pointer',
                    manageMode && checked ? 'border-accent/60 bg-accent/5' : 'border-accent/15 hover:border-accent/40',
                  ].join(' ')}
                >
                  {manageMode && (
                    <div className={[
                      'w-5 h-5 rounded-full border flex items-center justify-center shrink-0 self-center transition-all',
                      checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-card',
                    ].join(' ')}>
                      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                    </div>
                  )}
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                    {it.output_url && it.kind === 'photo' ? (
                      <img src={it.output_url} alt="" className="w-full h-full object-cover" />
                    ) : it.kind === 'copy' ? (
                      <FileText className="w-6 h-6 text-muted-foreground" />
                    ) : it.kind === 'video' ? (
                      <Video className="w-6 h-6 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[10px] text-accent tracking-[0.18em]">
                        {it.kind === 'photo' ? '图片' : it.kind === 'copy' ? '文案' : '视频'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(it.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {it.kind === 'copy' && (
                      <p className="text-[12px] mt-1 line-clamp-2 text-foreground/85 leading-relaxed">
                        {copyPreview(it) || '（无内容）'}
                      </p>
                    )}
                    {it.meta?.platform && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">平台 · {it.meta.platform}</p>
                    )}
                    {it.kind === 'video' && it.meta?.status && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        状态 · {statusLabel(it.meta.status)}
                        {it.meta?.error ? ` · ${String(it.meta.error).slice(0, 30)}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <AssetDetailDialog
        asset={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        onUpdated={(next) => {
          setItems((prev) => prev.map((it) => (it.id === next.id ? { ...it, ...next } : it)));
          setDetail(next);
        }}
      />

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除选中的 {selected.size} 条素材?</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

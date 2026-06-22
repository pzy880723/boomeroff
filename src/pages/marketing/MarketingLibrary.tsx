import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Loader2, Image as ImageIcon, FileText, Video, Trash2, Check, Pencil, Store, Building2, Plus, Lock, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AssetDetailDialog, copyPreview } from '@/components/marketing/AssetDetailDialog';
import { ShopFilterChips } from '@/components/marketing/ShopPicker';
import { ShopProfilePanel } from '@/components/marketing/ShopProfilePanel';
import { UploadAssetDialog } from '@/components/marketing/UploadAssetDialog';
import { useEffectiveShop } from '@/hooks/useShops';
import { stitchSegmentUrls } from '@/lib/stitchVideos';
import { CharacterCard } from '@/components/marketing/CharacterCard';
import { CharacterDialog } from '@/components/marketing/CharacterDialog';
import { CharacterCreateDialog } from '@/components/marketing/CharacterCreateDialog';

import { AssetTagDialog, DEFAULT_TAGS } from '@/components/marketing/AssetTagDialog';

type KindTab = 'all' | 'photo' | 'copy' | 'video' | 'character' | 'profile';

export default function MarketingLibrary() {
  const { user } = useAuth();
  const { shopId, setShopId, shops, isAdmin, loading: shopLoading } = useEffectiveShop();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageMode, setManageMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [tab, setTab] = useState<KindTab>('all');
  const [uploadKind, setUploadKind] = useState<'photo' | 'copy' | 'video' | null>(null);
  const [characters, setCharacters] = useState<any[]>([]);
  const [characterDetail, setCharacterDetail] = useState<any | null>(null);
  const [createCharOpen, setCreateCharOpen] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagEditAsset, setTagEditAsset] = useState<any | null>(null);

  const shopName = (id?: string | null) => shops.find((s) => s.id === id)?.name || '未分类';
  const currentShop = shops.find((s) => s.id === shopId);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('marketing_assets' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setItems((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  // 加载角色（按当前店铺）
  useEffect(() => {
    if (!shopId) { setCharacters([]); return; }
    (async () => {
      const { data } = await supabase
        .from('marketing_characters' as any)
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });
      setCharacters((data as any[]) || []);
    })();
  }, [shopId]);

  // 客户端拼接锁:每个 asset 只触发一次
  const stitchingRef = useRef<Set<string>>(new Set());

  const runStitch = async (asset: any, segmentUrls: string[]) => {
    if (!user) return;
    if (stitchingRef.current.has(asset.id)) return;
    stitchingRef.current.add(asset.id);
    const parentJobId: string = asset.meta?.job_id;
    try {
      setItems((prev) => prev.map((x) => x.id === asset.id ? {
        ...x, meta: { ...(x.meta || {}), status: 'stitching', stage: 'stitching', stitch_progress: 0 },
      } : x));
      const blob = await stitchSegmentUrls(segmentUrls, (info) => {
        const pct = Math.round(((info.segment - 1) / Math.max(1, info.total)) * 100);
        setItems((prev) => prev.map((x) => x.id === asset.id ? {
          ...x, meta: { ...(x.meta || {}), stitch_progress: pct, stitch_stage: info.stage },
        } : x));
      });
      const path = `${user.id}/${parentJobId}.mp4`;
      const up = await supabase.storage.from('marketing-videos').upload(path, blob, {
        contentType: 'video/mp4', upsert: true,
      });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from('marketing-videos').createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed.data?.signedUrl;
      if (!url) throw new Error('生成播放链接失败');
      const newMeta = { ...(asset.meta || {}), status: 'succeeded', stage: 'done', storage_path: path };
      delete newMeta.stitch_progress; delete newMeta.stitch_stage;
      await supabase.from('marketing_assets' as any).update({ output_url: url, meta: newMeta }).eq('id', asset.id);
      await supabase.from('marketing_video_jobs' as any).update({ status: 'succeeded', video_url: url }).eq('id', parentJobId);
      setItems((prev) => prev.map((x) => x.id === asset.id ? { ...x, output_url: url, meta: newMeta } : x));
      toast.success('视频拼接完成');
    } catch (e: any) {
      console.error('[stitch]', e);
      const err = e?.message || '拼接失败';
      setItems((prev) => prev.map((x) => x.id === asset.id ? {
        ...x, meta: { ...(x.meta || {}), status: 'failed', error: err },
      } : x));
      await supabase.from('marketing_assets' as any).update({
        meta: { ...(asset.meta || {}), status: 'failed', error: err },
      }).eq('id', asset.id);
      toast.error(`拼接失败:${err}`);
      stitchingRef.current.delete(asset.id); // 允许重试
    }
  };

  // 轮询未完成视频任务
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
          const { data } = await supabase.functions.invoke('poll-marketing-video', { body: { job_id: it.meta.job_id } });
          const next = data as any;
          if (!next) continue;
          // 多段任务全部完成:触发客户端拼接
          if (next.is_parent && next.status === 'ready_to_stitch' && Array.isArray(next.segment_urls)) {
            const urls = next.segment_urls.filter(Boolean);
            if (urls.length === next.segment_total) {
              runStitch(it, urls);
              continue;
            }
          }
          if (next.status && next.status !== it.meta?.status) {
            setItems((prev) => prev.map((x) => x.id === it.id ? {
              ...x, output_url: next.video_url || x.output_url,
              meta: {
                ...(x.meta || {}),
                status: next.status,
                segment_total: next.segment_total ?? x.meta?.segment_total,
                segment_done: next.segment_done ?? x.meta?.segment_done,
                error: next.error || undefined,
              },
            } : x));
          } else if (next.is_parent && typeof next.segment_done === 'number') {
            // 进度更新但状态未变
            setItems((prev) => prev.map((x) => x.id === it.id ? {
              ...x, meta: { ...(x.meta || {}), segment_done: next.segment_done, segment_total: next.segment_total },
            } : x));
          }
        } catch {}
      }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [items]);

  const statusLabel = (it: any) => {
    const s = it.meta?.status;
    const total = it.meta?.segment_total || 0;
    const done = it.meta?.segment_done || 0;
    if (s === 'stitching') {
      const pct = it.meta?.stitch_progress;
      return `拼接中${pct ? ` · ${pct}%` : '…'}`;
    }
    if (s === 'succeeded') return '已完成';
    if (s === 'failed') return '失败';
    if (total > 1) {
      if (done < total) return `生成中 ${done}/${total}`;
      return '准备拼接…';
    }
    return ({ queued: '排队中', running: '渲染中' } as Record<string, string>)[s || ''] || s || '排队中';
  };

  const filtered = useMemo(() => {
    let list = items;
    if (shopId) list = list.filter((it) => it.shop_id === shopId);
    if (tab === 'photo') list = list.filter((it) => it.kind === 'photo');
    else if (tab === 'copy') list = list.filter((it) => it.kind === 'copy');
    else if (tab === 'video') list = list.filter((it) => it.kind === 'video');
    return list;
  }, [items, shopId, tab]);

  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    const now = new Date();
    const thisYM = `${now.getFullYear()}-${now.getMonth()}`;
    filtered.forEach((it) => {
      const d = new Date(it.created_at);
      const ym = `${d.getFullYear()}-${d.getMonth()}`;
      const key = ym === thisYM ? '本月' : `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} 月`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries());
  }, [filtered]);

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

  const TABS: { v: KindTab; label: string }[] = [
    { v: 'all', label: '全部' },
    { v: 'photo', label: '图片' },
    { v: 'copy', label: '文案' },
    { v: 'video', label: '视频' },
    { v: 'character', label: '角色' },
    { v: 'profile', label: '店铺描述' },
  ];

  return (
    <>
      <PageHeader title="素材库" back="/me/marketing" subtitle="营销中心 / 按店铺管理" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-4 pb-12">
        {/* 店铺：管理员可切，店员锁定 */}
        <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-3 space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Store className="w-3.5 h-3.5 text-accent" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">当前店铺</span>
            {!isAdmin && (
              <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />已锁定本店
              </span>
            )}
          </div>
          {isAdmin ? (
            <ShopFilterChips
              value={shopId}
              onChange={(v) => setShopId(typeof v === 'string' ? v : null)}
              includeAll={false}
              includeUnassigned={false}
            />
          ) : (
            <div className="px-1 text-sm">
              {shopLoading ? '加载中…' : currentShop ? (
                <>
                  <span className="font-medium">{currentShop.name}</span>
                  {currentShop.address && <span className="text-muted-foreground ml-2 text-[12px]">· {currentShop.address}</span>}
                </>
              ) : '未绑定门店，请联系管理员'}
            </div>
          )}
        </section>

        {/* Tab 切换 */}
        {shopId && (
          <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
            {TABS.map((t) => (
              <TabBtn key={t.v} active={tab === t.v} onClick={() => setTab(t.v)}>{t.label}</TabBtn>
            ))}
          </div>
        )}

        {/* 店铺描述 */}
        {tab === 'profile' && shopId && (
          <ShopProfilePanel shopId={shopId} shopName={shopName(shopId)} />
        )}

        {/* 角色库 */}
        {tab === 'character' && shopId && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] text-muted-foreground">本店共 {characters.length} 个角色</p>
              <Button size="sm" variant="outline" onClick={() => setCreateCharOpen(true)} className="h-8">
                <Plus className="w-3.5 h-3.5" />新建角色
              </Button>
            </div>
            {characters.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">
                还没有角色。新建一个,生成视频时用 TA 锁定主角。
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                {characters.map((c) => (
                  <CharacterCard key={c.id} character={c} onClick={() => setCharacterDetail(c)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 素材列表 */}
        {tab !== 'profile' && tab !== 'character' && shopId && (<>
          {/* 上传按钮 + 管理 */}
          <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
            <div className="flex gap-1.5">
              {(tab === 'all' || tab === 'photo') && (
                <Button size="sm" variant="outline" onClick={() => setUploadKind('photo')} className="h-8">
                  <Plus className="w-3.5 h-3.5" />图片
                </Button>
              )}
              {(tab === 'all' || tab === 'copy') && (
                <Button size="sm" variant="outline" onClick={() => setUploadKind('copy')} className="h-8">
                  <Plus className="w-3.5 h-3.5" />文案
                </Button>
              )}
              {(tab === 'all' || tab === 'video') && (
                <Button size="sm" variant="outline" onClick={() => setUploadKind('video')} className="h-8">
                  <Plus className="w-3.5 h-3.5" />视频
                </Button>
              )}
            </div>
            {!loading && filtered.length > 0 && (
              manageMode ? (
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
              )
            )}
          </div>
          {!loading && filtered.length > 0 && (
            <p className="text-[11px] text-muted-foreground px-1">共 {filtered.length} 条</p>
          )}

          {loading && (
            <div className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">当前店铺暂无素材，点上方按钮上传</p>
          )}

          {groups.map(([key, list]) => {
            const mediaList = list.filter((it) => it.kind === 'photo' || it.kind === 'video');
            const copyList = list.filter((it) => it.kind === 'copy');
            return (
              <section key={key} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="w-1 h-1 rounded-full bg-accent" />
                  <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{key}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">{list.length} 条</span>
                  <span className="flex-1 h-px bg-border ml-2" />
                </div>

                {mediaList.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
                    {mediaList.map((it) => {
                      const checked = selected.has(it.id);
                      const thumbUrl = it.kind === 'photo'
                        ? it.output_url
                        : (it.meta?.cover_url || it.output_url);
                      const showStatus = it.kind === 'video' && it.meta?.status && it.meta.status !== 'succeeded';
                      return (
                        <button
                          type="button"
                          key={it.id}
                          onClick={() => { if (manageMode) toggleSel(it.id); else setDetail(it); }}
                          className={[
                            'relative aspect-square rounded-md overflow-hidden bg-muted border transition-all',
                            manageMode && checked ? 'ring-2 ring-primary border-primary' : 'border-border hover:border-accent/50',
                          ].join(' ')}
                        >
                          {thumbUrl ? (
                            it.kind === 'video' && !it.meta?.cover_url && it.output_url ? (
                              <video src={it.output_url} className="w-full h-full object-cover" muted preload="metadata" playsInline />
                            ) : (
                              <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                            )
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {it.kind === 'video'
                                ? <Video className="w-6 h-6 text-muted-foreground" />
                                : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                            </div>
                          )}

                          {it.kind === 'video' && (
                            <>
                              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="w-7 h-7 rounded-full bg-black/45 backdrop-blur flex items-center justify-center">
                                  <Play className="w-3.5 h-3.5 text-white fill-white" />
                                </span>
                              </span>
                              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] px-1 rounded leading-tight">VIDEO</span>
                            </>
                          )}

                          {showStatus && (
                            <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 text-center truncate">
                              {statusLabel(it)}
                            </span>
                          )}

                          {manageMode && (
                            <span className={[
                              'absolute top-1 left-1 w-5 h-5 rounded-full border flex items-center justify-center transition-all',
                              checked ? 'bg-primary border-primary text-primary-foreground' : 'bg-black/40 border-white/70 text-transparent',
                            ].join(' ')}>
                              <Check className="w-3 h-3" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {copyList.length > 0 && copyList.map((it) => {
                  const checked = selected.has(it.id);
                  return (
                    <div
                      key={it.id}
                      onClick={() => { if (manageMode) toggleSel(it.id); else setDetail(it); }}
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
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-[10px] text-accent tracking-[0.18em]">文案</span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(it.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Building2 className="w-2.5 h-2.5" />{shopName(it.shop_id)}
                          </span>
                        </div>
                        <p className="text-[12px] mt-1 line-clamp-2 text-foreground/85 leading-relaxed">
                          {copyPreview(it) || '（无内容）'}
                        </p>
                        {it.meta?.platform && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">平台 · {it.meta.platform}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>)}
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

      {uploadKind && shopId && (
        <UploadAssetDialog
          open={!!uploadKind}
          onOpenChange={(o) => { if (!o) setUploadKind(null); }}
          kind={uploadKind}
          shopId={shopId}
          onUploaded={(row) => setItems((prev) => [row, ...prev])}
        />
      )}

      <CharacterCreateDialog
        open={createCharOpen}
        onOpenChange={setCreateCharOpen}
        shopId={shopId}
        onCreated={(c) => setCharacters((prev) => [c, ...prev])}
      />
      <CharacterDialog
        character={characterDetail}
        open={!!characterDetail}
        onOpenChange={(o) => !o && setCharacterDetail(null)}
        onUpdated={(c) => { setCharacters((prev) => prev.map((x) => x.id === c.id ? c : x)); setCharacterDetail(c); }}
        onDeleted={(id) => { setCharacters((prev) => prev.filter((x) => x.id !== id)); setCharacterDetail(null); }}
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-4 h-9 text-[12px] -mb-px border-b-2 transition-colors whitespace-nowrap shrink-0',
        active ? 'border-accent text-accent font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >{children}</button>
  );
}

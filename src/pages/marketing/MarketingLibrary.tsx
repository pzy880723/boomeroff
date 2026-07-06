import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Loader2, Image as ImageIcon, FileText, Video, Trash2, Check, Pencil, Store, Building2, Plus, Lock, Play, X, Tags } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AssetDetailDialog, copyPreview } from '@/components/marketing/AssetDetailDialog';
import { ShopFilterChips } from '@/components/marketing/ShopPicker';
import { ShopProfilePanel } from '@/components/marketing/ShopProfilePanel';
import { UploadAssetDialog } from '@/components/marketing/UploadAssetDialog';
import { useEffectiveShop } from '@/hooks/useShops';
import { CharacterCard } from '@/components/marketing/CharacterCard';
import { CharacterDialog } from '@/components/marketing/CharacterDialog';
import { CharacterCreateDialog } from '@/components/marketing/CharacterCreateDialog';
import { IdentityVerifyDialog } from '@/components/marketing/IdentityVerifyDialog';
import { BatchPreflightButton } from '@/components/marketing/BatchPreflightButton';

import { AssetTagDialog } from '@/components/marketing/AssetTagDialog';
import { thumbUrl as thumb, thumbSrcSet } from '@/lib/imageUrl';
import { Skeleton } from '@/components/ui/skeleton';
import { LibraryErrorBoundary } from '@/components/marketing/LibraryErrorBoundary';
import { assetSource, type AssetSource } from '@/lib/assetSource';
import { Camera, Sparkles } from 'lucide-react';
import { invokeFn } from '@/lib/invokeFn';
import { completeMarketingVideoFromSegments, markMarketingVideoFailed } from '@/lib/completeMarketingVideo';

type KindTab = 'all' | 'photo' | 'copy' | 'video' | 'character' | 'profile';

export default function MarketingLibrary() {
  const { user } = useAuth();
  const { shopId, setShopId, shops, isAdmin, loading: shopLoading } = useEffectiveShop();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
  const [verifyCharacter, setVerifyCharacter] = useState<any | null>(null);
  const [tagEditAsset, setTagEditAsset] = useState<any | null>(null);
  const [loadedImgs, setLoadedImgs] = useState<Set<string>>(new Set());
  const [imgSource, setImgSource] = useState<AssetSource | 'all'>(() => {
    try {
      const v = localStorage.getItem('lib.imgSource') as any;
      // 旧默认是 'upload',全局升级到 'base'
      if (v === 'base' || v === 'upload' || v === 'generated' || v === 'all') return v;
      return 'base';
    } catch { return 'base'; }
  });
  useEffect(() => { try { localStorage.setItem('lib.imgSource', imgSource); } catch {} }, [imgSource]);

  const shopName = (id?: string | null) => shops.find((s) => s.id === id)?.name || '未分类';
  const currentShop = shops.find((s) => s.id === shopId);

  const PAGE_SIZE = 60;
  // 只显式取需要的列,避免将来 marketing_assets 新增大字段拖慢首屏。
  const ASSET_COLS = 'id, kind, output_url, output_text, input_image_urls, tags, category, shop_id, user_id, created_at, meta';

  const fetchItems = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      let q = supabase
        .from('marketing_assets' as any)
        .select(ASSET_COLS)
        .order('created_at', { ascending: false })
        .range(0, PAGE_SIZE - 1);
      if (shopId) q = q.eq('shop_id', shopId);
      else q = q.eq('user_id', user.id);
      const { data, error } = await q;
      if (error) throw error;
      const safe = ((data as any[]) || []).map((it) => ({ ...it, meta: it?.meta ?? {} }));
      setItems(safe);
      setHasMore(safe.length === PAGE_SIZE);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[MarketingLibrary] fetchItems failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!user || loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const offset = items.length;
      let q = supabase
        .from('marketing_assets' as any)
        .select(ASSET_COLS)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (shopId) q = q.eq('shop_id', shopId);
      else q = q.eq('user_id', user.id);
      const { data, error } = await q;
      if (error) throw error;
      const more = ((data as any[]) || []).map((it) => ({ ...it, meta: it?.meta ?? {} }));
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...more.filter((m) => !seen.has(m.id))];
      });
      setHasMore(more.length === PAGE_SIZE);
    } catch (e) {
      console.warn('[MarketingLibrary] loadMore failed:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  // 保留 load 名字给其它地方使用（如有）
  const load = () => fetchItems(false);
  useEffect(() => { setHasMore(true); fetchItems(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user, shopId]);

  // 实时订阅:同 shop 内素材变化静默刷新(不触发整页 loading 骨架闪烁)
  const reloadTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const filter = shopId ? `shop_id=eq.${shopId}` : `user_id=eq.${user.id}`;
    const ch = supabase
      .channel(`ma-lib:${shopId || user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_assets', filter }, () => {
        if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => fetchItems(true), 400);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, shopId]);

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

  // 挂载时清理 localStorage 中指向已不存在/已失败任务的恢复键,避免
  // SurpriseVideoDialog / MarketingVideo 抢占焦点把用户卷回旧的生成界面
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const recoveryKeys = Object.keys(localStorage).filter((k) =>
          /^(surprise-job-|marketing-video-draft-)/.test(k),
        );
        if (!recoveryKeys.length) return;
        const { data } = await supabase
          .from('marketing_video_jobs' as any)
          .select('id,status')
          .eq('user_id', user.id);
        const aliveJobs = new Map<string, string>(
          ((data as any[]) || []).map((r) => [r.id as string, r.status as string]),
        );
        recoveryKeys.forEach((k) => {
          const v = localStorage.getItem(k) || '';
          const jobMatches = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
          const orphan = jobMatches.length === 0
            ? false
            : jobMatches.every((jid) => {
                const s = aliveJobs.get(jid);
                return !s || ['failed', 'cancelled'].includes(s);
              });
          if (orphan) localStorage.removeItem(k);
        });
      } catch {}
    })();
  }, [user]);


  // 客户端拼接锁:每个 asset 只触发一次(失败后也不再重试,避免 403 循环)
  const stitchingRef = useRef<Set<string>>(new Set());

  // 标记单个视频任务为失败,并落库
  const markAssetFailed = async (assetId: string, currentMeta: any, error: string) => {
    const optimisticMeta = { ...(currentMeta || {}), status: 'failed', error };
    delete optimisticMeta.stitch_progress; delete optimisticMeta.stitch_stage;
    setItems((prev) => prev.map((x) => x.id === assetId ? { ...x, meta: optimisticMeta } : x));
    try {
      const nextMeta = await markMarketingVideoFailed(assetId, currentMeta, error);
      setItems((prev) => prev.map((x) => x.id === assetId ? { ...x, meta: nextMeta } : x));
    } catch {}
  };

  const runStitch = async (asset: any, segmentUrls: string[]) => {
    if (!user) return;
    if (stitchingRef.current.has(asset.id)) return;
    stitchingRef.current.add(asset.id);

    // 过期短路:火山方舟分段 URL 仅 24h 有效,超过 23h 直接判失败,不再尝试
    const createdAt = new Date(asset.created_at).getTime();
    if (Number.isFinite(createdAt) && Date.now() - createdAt > 23 * 60 * 60 * 1000) {
      await markAssetFailed(asset.id, asset.meta, '视频分段链接已过期(超过 24 小时),请重新生成');
      return;
    }

    const parentJobId: string = asset.meta?.job_id;
    try {
      setItems((prev) => prev.map((x) => x.id === asset.id ? {
        ...x, meta: { ...(x.meta || {}), status: 'stitching', stage: 'stitching', stitch_progress: 0 },
      } : x));
      const result = await completeMarketingVideoFromSegments({
        userId: user.id,
        jobId: parentJobId,
        segmentUrls,
        onProgress: (pct, info) => {
          setItems((prev) => prev.map((x) => x.id === asset.id ? {
            ...x, meta: { ...(x.meta || {}), stitch_progress: pct, stitch_stage: info?.stage },
          } : x));
        },
      });
      setItems((prev) => prev.map((x) => x.id === asset.id ? { ...x, output_url: result.url, meta: result.meta } : x));
      toast.success('视频拼接完成');
    } catch (e: any) {
      console.error('[stitch]', e);
      const raw = e?.message || '拼接失败';
      const expired = /403/.test(raw) || /分段读取失败/.test(raw);
      const err = expired ? '视频分段链接已过期(超过 24 小时),请重新生成此视频' : raw;
      await markAssetFailed(asset.id, asset.meta, err);
      toast.error(err);
    }
  };

  // 删除单个素材(含对应视频任务)
  const deleteAssetById = async (assetId: string, jobId?: string) => {
    try {
      await supabase.from('marketing_assets' as any).delete().eq('id', assetId);
      if (jobId) {
        try { await supabase.from('marketing_video_jobs' as any).delete().eq('id', jobId); } catch {}
      }
      setItems((prev) => prev.filter((x) => x.id !== assetId));
      // 同步清理可能残留的草稿/任务恢复键
      try {
        Object.keys(localStorage).forEach((k) => {
          if (!/^(surprise-job-|marketing-video-draft-)/.test(k)) return;
          const v = localStorage.getItem(k) || '';
          if (jobId && v.includes(jobId)) localStorage.removeItem(k);
          else if (v.includes(assetId)) localStorage.removeItem(k);
        });
      } catch {}
    } catch (e: any) {
      toast.error(e?.message || '删除失败');
    }
  };

  // 批量清理本店所有失败视频
  const [cleaningFailed, setCleaningFailed] = useState(false);
  const cleanupFailedVideos = async () => {
    const failedList = items.filter((it) => it.kind === 'video' && it.meta?.status === 'failed');
    if (!failedList.length) { toast('没有失败的视频需要清理'); return; }
    setCleaningFailed(true);
    const ids = failedList.map((it) => it.id);
    const jobIds = failedList.map((it) => it.meta?.job_id).filter(Boolean);
    try {
      await supabase.from('marketing_assets' as any).delete().in('id', ids);
      if (jobIds.length) {
        try { await supabase.from('marketing_video_jobs' as any).delete().in('id', jobIds); } catch {}
      }
      setItems((prev) => prev.filter((x) => !ids.includes(x.id)));
      // 清理孤儿草稿
      try {
        Object.keys(localStorage).forEach((k) => {
          if (!/^(surprise-job-|marketing-video-draft-)/.test(k)) return;
          const v = localStorage.getItem(k) || '';
          if (jobIds.some((jid) => v.includes(jid)) || ids.some((id) => v.includes(id))) {
            localStorage.removeItem(k);
          }
        });
      } catch {}
      toast.success(`已清理 ${ids.length} 条失败视频`);
    } catch (e: any) {
      toast.error(e?.message || '清理失败');
    } finally {
      setCleaningFailed(false);
    }
  };

  // 一次性回填历史分镜头到素材库
  const [backfilling, setBackfilling] = useState(false);
  const runBackfillStoryboards = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const { data, error } = await invokeFn('backfill-storyboard-assets', { body: {} });
      if (error || (data as any)?.ok === false) {
        toast.error((data as any)?.error || error?.message || '回填失败');
        return;
      }
      const d = data as any;
      toast.success(`回填完成:新增 ${d.inserted} / 跳过 ${d.skipped} / 失败 ${d.failed}(共 ${d.total} 张)`);
      fetchItems(true);
    } catch (e: any) {
      toast.error(e?.message || '回填失败');
    } finally {
      setBackfilling(false);
    }
  };

  // 一次性给历史无标签素材补 AI 标签
  const [backfillingTags, setBackfillingTags] = useState(false);
  const runBackfillTags = async () => {
    if (backfillingTags) return;
    setBackfillingTags(true);
    try {
      const { data, error } = await invokeFn('backfill-marketing-asset-tags', { body: {} });
      if (error || (data as any)?.ok === false) {
        toast.error((data as any)?.error || error?.message || '补标签失败');
        return;
      }
      const d = data as any;
      const remainTxt = d.remaining > 0 ? ` · 还剩 ${d.remaining} 张,可再点一次` : ' · 全部完成';
      toast.success(`本轮补标签 ${d.updated}/${d.processed} 张${remainTxt}`);
      fetchItems(true);
    } catch (e: any) {
      toast.error(e?.message || '补标签失败');
    } finally {
      setBackfillingTags(false);
    }
  };

  // 一次性:把历史素材按规则回填 meta.asset_class(base / upload / generated)
  const [reclassing, setReclassing] = useState(false);
  const runReclassify = async () => {
    if (reclassing) return;
    setReclassing(true);
    try {
      const { data, error } = await invokeFn('backfill-asset-class', { body: {} });
      if (error || (data as any)?.ok === false) {
        toast.error((data as any)?.error || error?.message || '重整失败');
        return;
      }
      const d = data as any;
      toast.success(`重整完成 · 基础 ${d.base} / 上传 ${d.upload} / AI ${d.generated}`);
      fetchItems(true);
    } catch (e: any) {
      toast.error(e?.message || '重整失败');
    } finally {
      setReclassing(false);
    }
  };

  // 一次性:批量清理无意义标签(场景1..场景11 / 英文情绪词 / AI智能广告 等)
  const [cleaningTags, setCleaningTags] = useState(false);
  const runCleanTags = async () => {
    if (cleaningTags) return;
    if (!confirm('将批量删除「场景1..场景11、elegant、AI智能广告」等噪声标签,确认继续吗?')) return;
    setCleaningTags(true);
    try {
      const { data, error } = await invokeFn('cleanup-marketing-tags', { body: {} });
      if (error || (data as any)?.ok === false) {
        toast.error((data as any)?.error || error?.message || '清理失败');
        return;
      }
      const d = data as any;
      toast.success(`清理完成 · 移除 ${d.removed_tags} 个噪声 · 涉及 ${d.affected_rows} 条素材`);
      fetchItems(true);
    } catch (e: any) {
      toast.error(e?.message || '清理失败');
    } finally {
      setCleaningTags(false);
    }
  };





  // 轮询未完成视频任务
  // 用稳定签名当依赖,避免 items 引用变化导致 effect 反复重建 -> tick 立即触发 -> setItems -> 循环闪烁
  // 失败的任务不再自动重新拉取/重新拼接:火山方舟分段 URL 只有 24h,过期后只能重新生成
  const pendingVideos = useMemo(
    () => items.filter(
      (it) => it.kind === 'video' && it.meta?.job_id
        && !['succeeded', 'failed'].includes(it.meta?.status),
    ),
    [items],
  );
  const pendingSig = pendingVideos
    .map((it) => `${it.id}:${it.meta?.status || ''}:${it.meta?.segment_done || 0}/${it.meta?.segment_total || 0}`)
    .join('|');
  const pendingRef = useRef<any[]>([]);
  pendingRef.current = pendingVideos;

  useEffect(() => {
    if (!pendingSig) return;
    let cancelled = false;
    const tick = async () => {
      for (const it of pendingRef.current) {
        if (cancelled) return;
        // 创建超过 23h 的待处理任务,直接判失败,跳过轮询(分段 URL 已过期)
        const createdAt = new Date(it.created_at).getTime();
        if (Number.isFinite(createdAt) && Date.now() - createdAt > 23 * 60 * 60 * 1000) {
          await markAssetFailed(it.id, it.meta, '视频分段链接已过期(超过 24 小时),请重新生成');
          continue;
        }
        try {
          const { data } = await invokeFn('poll-marketing-video', { body: { job_id: it.meta.job_id } });
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
    const first = window.setTimeout(tick, 400);
    const t = setInterval(tick, 4000); // 加快进度反馈
    return () => { cancelled = true; clearTimeout(first); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSig]);

  const statusLabel = (it: any) => {
    const s = it.meta?.status;
    const total = it.meta?.segment_total || 0;
    const done = it.meta?.segment_done || 0;
    if (s === 'stitching') {
      const pct = it.meta?.stitch_progress;
      return `拼接中${pct ? ` · ${pct}%` : '…'}`;
    }
    if (s === 'succeeded') return '已完成';
    if (s === 'failed') return '已失败 · 点 ✕ 删除';
    if (total > 1) {
      if (done < total) return `生成中 ${done}/${total}`;
      return '准备拼接…';
    }
    return ({ queued: '排队中', running: '渲染中' } as Record<string, string>)[s || ''] || s || '排队中';
  };

  // 标签噪声过滤:旧数据里有大量 "场景1..场景11"、英文情绪词、"AI智能广告" 等无意义标签
  // 这里只过滤"筛选条/热门词典"的显示,数据库原样保留(由"清理标签"一次性按钮真正删除)
  const isNoiseTag = (t: string) => {
    if (!t) return true;
    if (/^场景[一二三四五六七八九十\d]+$/.test(t)) return true;
    if (/^图[一二三四五六七八九十\d]+$/.test(t)) return true;
    if (/^分镜头[一二三四五六七八九十\d]+$/.test(t)) return true;
    if (/^(elegant|energetic|lively|playful|steady|calm|moody|warm|cool)$/i.test(t)) return true;
    if (/^AI[\s_-]?(智能广告|生成|图片?)$/.test(t)) return true;
    return false;
  };

  const tagOptions = useMemo(() => {
    // 只用当前 items 里出现 ≥1 次的标签,且过滤噪声;白名单按出现频次排序
    const freq = new Map<string, number>();
    items.forEach((it) => (Array.isArray(it.tags) ? it.tags : []).forEach((t: string) => {
      if (!t || isNoiseTag(t)) return;
      freq.set(t, (freq.get(t) || 0) + 1);
    }));
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (shopId) list = list.filter((it) => it.shop_id === shopId);
    if (tab === 'photo') list = list.filter((it) => it.kind === 'photo');
    else if (tab === 'copy') list = list.filter((it) => it.kind === 'copy');
    else if (tab === 'video') list = list.filter((it) => it.kind === 'video');
    if ((tab === 'all' || tab === 'photo') && imgSource !== 'all') {
      list = list.filter((it) => {
        // 视频/文案不受来源过滤影响,只过滤 photo
        if (it.kind !== 'photo') return true;
        return assetSource(it) === imgSource;
      });
    }
    if (activeTag) list = list.filter((it) => Array.isArray(it.tags) && it.tags.includes(activeTag));
    return list;
  }, [items, shopId, tab, activeTag, imgSource]);

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
    <LibraryErrorBoundary>
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
            <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
              <p className="text-[11px] text-muted-foreground">本店共 {characters.length} 个角色</p>
              <div className="flex items-center gap-1.5">
                <BatchPreflightButton
                  characters={characters}
                  onUpdated={(updates) => {
                    setCharacters((prev) => prev.map((c) => updates[c.id] ? { ...c, ...updates[c.id] } : c));
                  }}
                />
                <Button size="sm" variant="outline" onClick={() => setCreateCharOpen(true)} className="h-8">
                  <Plus className="w-3.5 h-3.5" />新建角色
                </Button>
              </div>
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
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={runBackfillStoryboards}
                      disabled={backfilling}
                      title="把历史分镜头图回填到素材库"
                    >
                      {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      回填分镜头
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={runBackfillTags}
                      disabled={backfillingTags}
                      title="给历史无标签的素材一次性补 AI 标签"
                    >
                      {backfillingTags ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      补标签
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={runReclassify}
                      disabled={reclassing}
                      title="按规则把历史素材分到 基础/上传/AI 三类"
                    >
                      {reclassing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      重整来源
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={runCleanTags}
                      disabled={cleaningTags}
                      title="批量删除无意义标签(场景1..场景11、英文情绪词、AI智能广告 等)"
                    >
                      {cleaningTags ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      清理标签
                    </Button>
                  )}



                  {items.some((it) => it.kind === 'video' && it.meta?.status === 'failed') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={cleanupFailedVideos}
                      disabled={cleaningFailed}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {cleaningFailed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      清理失败视频
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setManageMode(true)}>
                    <Pencil className="w-3.5 h-3.5" />管理
                  </Button>
                </div>
              )
            )}
          </div>

          {/* 来源分段:基础素材 / 我上传的 / AI 生成 / 全部 */}
          {(tab === 'all' || tab === 'photo') && (
            <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-[11px] flex-wrap">
              {([
                { v: 'base', label: '📌 基础素材', Icon: null as any },
                { v: 'upload', label: '我上传的', Icon: Camera },
                { v: 'generated', label: 'AI 生成', Icon: Sparkles },
                { v: 'all', label: '全部', Icon: null as any },
              ] as { v: AssetSource | 'all'; label: string; Icon: any }[]).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setImgSource(opt.v)}
                  className={[
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors',
                    imgSource === opt.v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {opt.Icon && <opt.Icon className="w-3 h-3" />}{opt.label}
                </button>
              ))}
            </div>
          )}

          {/* tag 筛选 */}
          {(tab === 'all' || tab === 'photo') && tagOptions.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
              <button
                onClick={() => setActiveTag(null)}
                className={[
                  'shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                  !activeTag ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border',
                ].join(' ')}
              >全部</button>
              {tagOptions.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                  className={[
                    'shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                    activeTag === t ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border',
                  ].join(' ')}
                >{t}</button>
              ))}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <p className="text-[11px] text-muted-foreground px-1">共 {filtered.length} 条{activeTag ? ` · 标签「${activeTag}」` : ''}</p>
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
                    {mediaList.map((it, idx) => {
                      const checked = selected.has(it.id);
                      const rawThumb = it.kind === 'photo'
                        ? it.output_url
                        : (it.meta?.poster_url
                            || it.meta?.cover_url
                            || null);
                      const thumbUrl = rawThumb ? (thumb(rawThumb, 240) || rawThumb) : null;
                      const srcSet = rawThumb ? thumbSrcSet(rawThumb, 120) : undefined;
                      const isImgLoaded = !rawThumb || loadedImgs.has(it.id);
                      const eager = idx < 6;
                      const showStatus = it.kind === 'video' && it.meta?.status && it.meta.status !== 'succeeded';
                      const segTotal = Number(it.meta?.segment_total) || 0;
                      const segDone = Number(it.meta?.segment_done) || 0;
                      const stitchPct = Number(it.meta?.stitch_progress) || 0;
                      const isStitching = it.meta?.status === 'stitching';
                      const isFailed = it.meta?.status === 'failed';
                      const videoPct = isFailed
                        ? 0
                        : isStitching
                          ? Math.max(80, Math.min(99, 80 + Math.round(stitchPct * 0.2)))
                          : segTotal > 0
                            ? Math.min(95, Math.round((segDone / segTotal) * 80))
                            : 8;
                      const videoTitle = it.kind === 'video'
                        ? (it.meta?.title || it.meta?.topic || '').toString().trim()
                        : '';
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
                            <>
                              {!isImgLoaded && (
                                <Skeleton className="absolute inset-0 rounded-none" />
                              )}
                              <img
                                src={thumbUrl}
                                srcSet={srcSet}
                                sizes="(min-width: 768px) 20vw, 33vw"
                                alt=""
                                width={240}
                                height={240}
                                className={`w-full h-full object-cover transition-opacity duration-200 ${isImgLoaded ? 'opacity-100' : 'opacity-0'}`}
                                loading={eager ? 'eager' : 'lazy'}
                                decoding="async"
                                {...(eager ? { fetchPriority: 'high' as const } : {})}
                                onLoad={() => setLoadedImgs((prev) => prev.has(it.id) ? prev : new Set(prev).add(it.id))}
                                onError={() => setLoadedImgs((prev) => prev.has(it.id) ? prev : new Set(prev).add(it.id))}
                              />
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {it.kind === 'video'
                                ? <Video className="w-6 h-6 text-muted-foreground" />
                                : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                            </div>
                          )}

                          {/* 来源角标:仅 photo,在「全部」视图下显示以区分三类来源 */}
                          {it.kind === 'photo' && imgSource === 'all' && !manageMode && (() => {
                            const cls = assetSource(it);
                            const meta = cls === 'generated'
                              ? { label: 'AI 生成', glyph: <Sparkles className="w-2.5 h-2.5" />, bg: 'bg-violet-500/85' }
                              : cls === 'base'
                                ? { label: '基础素材', glyph: <span className="text-[8px] leading-none">📌</span>, bg: 'bg-amber-500/85' }
                                : { label: '我上传的', glyph: <Camera className="w-2.5 h-2.5" />, bg: 'bg-black/55' };
                            return (
                              <span
                                className={`absolute top-1 left-1 w-4 h-4 rounded-full ${meta.bg} backdrop-blur text-white flex items-center justify-center`}
                                title={meta.label}
                              >
                                {meta.glyph}
                              </span>
                            );
                          })()}




                          {it.kind === 'photo' && !manageMode && (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); setTagEditAsset(it); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setTagEditAsset(it); } }}
                              className="absolute bottom-1 left-1 max-w-[80%] text-[9px] bg-foreground/55 text-background px-1.5 py-0.5 rounded cursor-pointer hover:bg-foreground/80 transition-colors truncate"
                            >
                              {Array.isArray(it.tags) && it.tags.length > 0
                                ? it.tags.slice(0, 2).join(' · ') + (it.tags.length > 2 ? ` · 共${it.tags.length}` : '')
                                : '+标签'}

                            </span>
                          )}

                          {it.kind === 'video' && !showStatus && (
                            <>
                              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="w-7 h-7 rounded-full bg-black/45 backdrop-blur flex items-center justify-center">
                                  <Play className="w-3.5 h-3.5 text-white fill-white" />
                                </span>
                              </span>
                              {videoTitle ? (
                                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-1.5 pt-3 pb-1 text-white text-[10px] leading-tight truncate text-left">
                                  {videoTitle}
                                </span>
                              ) : (
                                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] px-1 rounded leading-tight">VIDEO</span>
                              )}
                            </>
                          )}


                          {showStatus && (
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex flex-col justify-end p-1.5 gap-1">
                              <div className="text-white text-[10px] leading-tight font-medium truncate text-center">
                                {statusLabel(it)}
                              </div>
                              <div className="h-1 rounded-full bg-white/25 overflow-hidden">
                                <div
                                  className={[
                                    'h-full rounded-full transition-all duration-500',
                                    isFailed ? 'bg-destructive' : 'bg-accent',
                                  ].join(' ')}
                                  style={{ width: `${videoPct}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {isFailed && !manageMode && (
                            <button
                              type="button"
                              aria-label="删除失败任务"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('删除这条失败的视频任务？')) deleteAssetById(it.id, it.meta?.job_id);
                              }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center shadow"
                            >
                              <X className="w-3 h-3" strokeWidth={3} />
                            </button>
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
          {!loading && hasMore && (
            <LoadMoreSentinel onVisible={loadMore} loading={loadingMore} />
          )}
          {!loading && !hasMore && filtered.length > 0 && (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              已加载全部 · 共 {filtered.length} 条
            </p>
          )}
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
        onDelete={(a) => deleteAssetById(a.id, a.meta?.job_id)}
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
        onCreated={(c, opts) => {
          setCharacters((prev) => [c, ...prev]);
          if (opts?.autoVerify) setVerifyCharacter(c);
        }}
      />
      <IdentityVerifyDialog
        open={!!verifyCharacter}
        onOpenChange={(o) => !o && setVerifyCharacter(null)}
        character={verifyCharacter}
        onVerified={({ asset_id, asset_uri }) => {
          setCharacters((prev) => prev.map((x) => x.id === verifyCharacter?.id
            ? { ...x, verified_asset_id: asset_id, verified_asset_uri: asset_uri, verified_at: new Date().toISOString() }
            : x));
        }}
      />

      <CharacterDialog
        character={characterDetail}
        open={!!characterDetail}
        onOpenChange={(o) => !o && setCharacterDetail(null)}
        onUpdated={(c) => { setCharacters((prev) => prev.map((x) => x.id === c.id ? c : x)); setCharacterDetail(c); }}
        onDeleted={(id) => { setCharacters((prev) => prev.filter((x) => x.id !== id)); setCharacterDetail(null); }}
      />

      <AssetTagDialog
        open={!!tagEditAsset}
        onOpenChange={(o) => !o && setTagEditAsset(null)}
        assetId={tagEditAsset?.id || null}
        initialTags={tagEditAsset?.tags || []}
        initialCategory={tagEditAsset?.category || null}
        suggestedTags={tagOptions}
        onSaved={(tags, category) => {
          if (!tagEditAsset) return;
          setItems((prev) => prev.map((x) => x.id === tagEditAsset.id ? { ...x, tags, category } : x));
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
    </LibraryErrorBoundary>


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

function LoadMoreSentinel({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onVisible();
    }, { rootMargin: '600px 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [onVisible]);
  return (
    <div ref={ref} className="py-6 text-center text-[11px] text-muted-foreground">
      {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto text-accent" /> : '上拉加载更多'}
    </div>
  );
}


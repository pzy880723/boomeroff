// 从素材库选图 + 直接上传到素材库
// - 顶部 tag 筛选 chip
// - 上传进度 + 失败原因 + 重试
// - 实时同步:同 shop_id 其他成员入库,这里也会自动刷新
// - 哈希去重(整店级)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Check, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { uploadMarketingImages, type UploadStage } from '@/pages/marketing/uploadMarketingImages';
import { fileSha256 } from '@/lib/fileSha256';
import { UploadProgressBar, ItemTile, type UploadTileItem } from './UploadProgressTiles';
import { DEFAULT_TAGS } from './AssetTagDialog';

type Pending = UploadTileItem & { file: File };

export function LibraryImagePickerDialog({
  open, onOpenChange, shopId, max = 20, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string | null;
  max?: number;
  onConfirm: (urls: string[]) => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadTimerRef = useRef<number | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from('marketing_assets' as any)
      .select('id, output_url, shop_id, tags, category, user_id, created_at')
      .eq('kind', 'photo')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(120);
    if (shopId) q = q.eq('shop_id', shopId);
    else q = q.eq('user_id', user.id);
    const { data } = await q;
    setItems((data as any[]) || []);
    setLoading(false);
  };
  const scheduleLoad = () => {
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
    loadTimerRef.current = window.setTimeout(load, 400);
  };

  useEffect(() => {
    if (!open || !user) return;
    setSel(new Set());
    setActiveTag(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, shopId]);

  // 实时订阅:同 shop 内 marketing_assets 变化触发刷新
  useEffect(() => {
    if (!open || !user) return;
    const filter = shopId ? `shop_id=eq.${shopId}` : `user_id=eq.${user.id}`;
    const ch = supabase
      .channel(`ma-picker:${shopId || user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketing_assets', filter }, () => scheduleLoad())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, user, shopId]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_TAGS);
    items.forEach((it) => (it.tags || []).forEach((t: string) => set.add(t)));
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!activeTag) return items;
    return items.filter((it) => Array.isArray(it.tags) && it.tags.includes(activeTag));
  }, [items, activeTag]);

  const toggle = (url: string) => {
    const next = new Set(sel);
    if (next.has(url)) next.delete(url);
    else { if (next.size >= max) return; next.add(url); }
    setSel(next);
  };

  const updatePending = (id: string, patch: Partial<Pending>) =>
    setPending((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removePending = (id: string) => setPending((p) => p.filter((it) => it.id !== id));

  const processOne = async (
    file: File,
    onStage: (s: UploadStage, error?: string) => void,
  ): Promise<{ url: string; reused: boolean }> => {
    if (!user) throw new Error('未登录');
    onStage('compressing');
    const hash = await fileSha256(file).catch(() => `r-${Math.random()}`);

    // 整店级去重
    try {
      let q = supabase
        .from('marketing_assets' as any)
        .select('output_url')
        .eq('sha256', hash)
        .not('output_url', 'is', null)
        .limit(1);
      if (shopId) q = q.eq('shop_id', shopId);
      else q = q.eq('user_id', user.id).is('shop_id', null);
      const { data } = await q.maybeSingle();
      const hit = (data as any)?.output_url;
      if (hit) { onStage('done'); return { url: hit, reused: true }; }
    } catch {}

    let finalUrl: string | undefined;
    let finalErr: string | undefined;
    await uploadMarketingImages(user.id, [file], {
      preset: 'thumb',
      onProgress: ({ stage, url, error }) => {
        onStage(stage, error);
        if (stage === 'done' && url) finalUrl = url;
        if (stage === 'error') finalErr = error;
      },
    });
    if (!finalUrl) throw new Error(finalErr || '上传失败');

    const ins = await supabase.from('marketing_assets' as any).insert({
      user_id: user.id,
      shop_id: shopId,
      kind: 'photo',
      output_url: finalUrl,
      input_image_urls: [finalUrl],
      sha256: hash,
      tags: activeTag ? [activeTag] : [],
      meta: { source: 'library_picker_upload', sha256: hash, filename: file.name },
    });
    if (ins.error) throw new Error(ins.error.message || '入库失败');

    return { url: finalUrl, reused: false };
  };

  const runOne = async (id: string, file: File) => {
    try {
      const { url, reused } = await processOne(file, (stage, error) => updatePending(id, { stage, error }));
      // 自动勾选(不超过 max)
      setSel((prev) => {
        if (prev.size >= max || prev.has(url)) return prev;
        const next = new Set(prev); next.add(url); return next;
      });
      if (reused) toast.success('已在素材库中复用');
      setTimeout(() => removePending(id), 50);
      await load();
    } catch (e: any) {
      const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e || {}).slice(0, 80)) || '上传失败';
      updatePending(id, { stage: 'error', error: msg });
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || !user) return;
    const arr = Array.from(files).slice(0, max);
    if (!arr.length) return;

    const newItems: Pending[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      preview: URL.createObjectURL(f),
      stage: 'queued',
    }));
    setPending((p) => [...p, ...newItems]);
    // 串行(对话框场景上传量小,避免并发)
    for (const it of newItems) await runOne(it.id, it.file);
  };

  const retry = async (id: string) => {
    const it = pending.find((x) => x.id === id);
    if (!it) return;
    updatePending(id, { stage: 'queued', error: undefined });
    await runOne(id, it.file);
  };

  const pendingActive = pending.filter((p) => p.stage !== 'error').length;
  const pendingDone = pending.filter((p) => p.stage === 'done').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">从素材库导入</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {shopId ? '当前店铺图片(同店共享)' : '我的图片'} · 最多 {max} · 已选 {sel.size}
          </p>
          <Button
            size="sm" variant="outline" className="h-7 text-[11px] gap-1"
            disabled={sel.size >= max}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="w-3 h-3" />
            上传到素材库
          </Button>
          <input
            ref={fileInput} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }}
          />
        </div>

        {/* tag 筛选 */}
        {tagOptions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
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

        {/* 上传进度 */}
        {pending.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <UploadProgressBar total={pendingActive + pendingDone} done={pendingDone} />
            <div className="p-2">
              <div className="grid grid-cols-4 gap-2">
                {pending.map((p) => (
                  <ItemTile key={p.id} item={p} onRetry={() => retry(p.id)} onRemove={() => removePending(p.id)} />
                ))}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
        ) : filteredItems.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">{activeTag ? `没有「${activeTag}」标签的图片` : '该店铺暂无图片素材'}</p>
            <p className="text-[11px] text-muted-foreground/70">点右上「上传到素材库」直接传几张</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredItems.map((it) => {
              const url = it.output_url as string;
              const active = sel.has(url);
              return (
                <button key={it.id} onClick={() => toggle(url)}
                  className={[
                    'relative aspect-square rounded overflow-hidden border-2 transition-all',
                    active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40',
                  ].join(' ')}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {Array.isArray(it.tags) && it.tags.length > 0 && (
                    <span className="absolute bottom-1 left-1 text-[9px] bg-foreground/60 text-background px-1.5 py-0.5 rounded">
                      {it.tags[0]}{it.tags.length > 1 ? `+${it.tags.length - 1}` : ''}
                    </span>
                  )}
                  {active && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1" disabled={!sel.size}
            onClick={() => { onConfirm(Array.from(sel)); onOpenChange(false); }}>
            导入 {sel.size} 张
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

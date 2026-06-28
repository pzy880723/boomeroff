// 视频页"选择主角"组件：横滑选 + 新建 + 附加参考图(最多 6 张,搭配角色板共 7 张,留出脚本侧再带入 2 张实景到 Seedance 的 9 张参考上限)
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, User, X, Upload, FolderOpen, Loader2, ShieldCheck } from 'lucide-react';
import { CharacterCreateDialog } from './CharacterCreateDialog';
import { LibraryImagePickerDialog } from './LibraryImagePickerDialog';
import { useAuth } from '@/hooks/useAuth';
import { uploadMarketingImages } from '@/pages/marketing/uploadMarketingImages';
import { toast } from 'sonner';
import { thumbUrl } from '@/lib/imageUrl';
import { ImageLightbox } from '@/components/voucher/ImageLightbox';

export type Character = {
  id: string;
  name: string;
  role_label: string | null;
  cover_url: string;
  visual_signature: string | null;
  core_emotion: string | null;
  auto_anchor?: boolean;
  verified_asset_uri?: string | null;
  verified_at?: string | null;
  meta?: { verify_kind?: string | null } | null;
  /** 仅在前端/本次视频中使用,不持久化到 marketing_characters 表 */
  extra_reference_urls?: string[];
};

const MAX_EXTRA_REFS = 6;

export function CharacterPicker({
  shopId, value, onChange,
}: {
  shopId: string | null;
  value: Character | null;
  onChange: (c: Character | null) => void;
}) {
  const [items, setItems] = useState<Character[]>([]);
  const [open, setOpen] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lbIdx, setLbIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  // lightbox 图片合集:封面 + 全部附加参考图
  const lbImages = useMemo(() => {
    if (!value) return [];
    const list = [value.cover_url, ...(value.extra_reference_urls || [])].filter(Boolean) as string[];
    return Array.from(new Set(list));
  }, [value]);

  const load = async () => {
    if (!shopId) { setItems([]); return; }
    const { data } = await supabase
      .from('marketing_characters' as any)
      .select('id, name, role_label, cover_url, visual_signature, core_emotion, auto_anchor, verified_asset_uri, verified_at, meta')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    setItems((data as any) || []);
  };
  useEffect(() => { load(); }, [shopId]);

  const extras = value?.extra_reference_urls || [];
  const remain = Math.max(0, MAX_EXTRA_REFS - extras.length);

  const addExtras = (urls: string[]) => {
    if (!value || !urls.length) return;
    const merged = [...extras];
    for (const u of urls) {
      if (!u) continue;
      if (merged.includes(u)) continue;
      merged.push(u);
      if (merged.length >= MAX_EXTRA_REFS) break;
    }
    onChange({ ...value, extra_reference_urls: merged });
  };
  const removeExtra = (u: string) => {
    if (!value) return;
    onChange({ ...value, extra_reference_urls: extras.filter((x) => x !== u) });
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !user || !value) return;
    setUploading(true);
    const tid = toast.loading(`上传中 (0/${files.length})`);
    let done = 0;
    try {
      const results = await uploadMarketingImages(user.id, files.slice(0, remain), {
        preset: 'thumb',
        onProgress: (ev) => {
          if (ev.stage === 'done') { done++; toast.loading(`上传中 (${done}/${files.length})`, { id: tid }); }
        },
      });
      toast.dismiss(tid);
      const ok = results.filter((u): u is string => !!u);
      if (!ok.length) { toast.error('上传失败'); return; }
      addExtras(ok);
      toast.success(`已加入 ${ok.length} 张主角参考图`);
    } catch (err: any) {
      toast.dismiss(tid);
      toast.error(err?.message || '上传失败');
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="space-y-2 bg-primary/5 border border-primary/30 rounded-md p-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLbIdx(0)}
              className="w-10 h-10 rounded overflow-hidden shrink-0"
              aria-label="放大查看封面"
            >
              <img src={thumbUrl(value.cover_url, 240) || value.cover_url} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate">{value.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{value.role_label || '主角'}</p>
            </div>
            <button onClick={() => onChange(null)} className="p-1 hover:bg-background rounded" aria-label="取消选择">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="border-t border-primary/15 pt-2">
            <p className="text-[10px] text-muted-foreground mb-1.5">
              附加参考图({extras.length}/{MAX_EXTRA_REFS}) · 每段视频都会带这些图,用来锁人物长相 / 服装
            </p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {extras.map((u, i) => (
                <div key={u} className="relative w-12 h-12 rounded overflow-hidden border border-primary/20 group">
                  <button
                    type="button"
                    onClick={() => setLbIdx(i + 1)}
                    className="block w-full h-full"
                    aria-label="放大查看"
                  >
                    <img src={thumbUrl(u, 240) || u} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeExtra(u); }}
                    className="absolute top-0 right-0 w-5 h-5 bg-black/65 text-white flex items-center justify-center rounded-bl"
                    aria-label="删除"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {remain > 0 && (
                <>
                  <button
                    onClick={() => setLibOpen(true)}
                    className="w-12 h-12 rounded border border-dashed border-accent/40 bg-accent/5 text-accent flex flex-col items-center justify-center text-[8px] gap-0.5 hover:bg-accent/10"
                  >
                    <FolderOpen className="w-3 h-3" />素材库
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-12 h-12 rounded border border-dashed border-accent/40 bg-accent/5 text-accent flex flex-col items-center justify-center text-[8px] gap-0.5 hover:bg-accent/10 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}上传
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => setOpen(true)}
          className="flex-shrink-0 w-16 h-16 rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:border-accent/50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-[9px]">新建</span>
        </button>
        {items.map((c) => {
          const active = value?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onChange(active ? null : { ...c, extra_reference_urls: value?.id === c.id ? value.extra_reference_urls : [] })}
              className={[
                'flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all relative',
                active ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-accent/40',
              ].join(' ')}
              title={c.name}
            >
              <img src={thumbUrl(c.cover_url, 160) || c.cover_url} className="w-full h-full object-cover" alt={c.name} loading="lazy" decoding="async" />
              <span className="absolute inset-x-0 bottom-0 bg-black/65 text-white text-[8px] py-0.5 px-0.5 truncate">{c.name}</span>
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="flex-1 flex items-center text-[10px] text-muted-foreground pl-1">
            <User className="w-3 h-3 mr-1" />还没有角色,新建一个保持人物一致性
          </div>
        )}
      </div>
      <CharacterCreateDialog
        open={open}
        onOpenChange={setOpen}
        shopId={shopId}
        onCreated={(c) => { setItems((prev) => [c, ...prev]); onChange({ ...c, extra_reference_urls: [] }); }}
      />
      <LibraryImagePickerDialog
        open={libOpen}
        onOpenChange={setLibOpen}
        shopId={shopId}
        max={remain}
        onConfirm={(picked) => addExtras(picked)}
      />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
      <ImageLightbox
        open={lbIdx !== null}
        onClose={() => setLbIdx(null)}
        images={lbImages}
        initialIndex={lbIdx ?? 0}
      />
    </div>
  );
}

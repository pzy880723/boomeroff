import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CATEGORY_LABELS, CATEGORY_ORDER, ProductCategory } from '@/types';
import { Loader2, Upload, Globe, Star, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { WebImagePickerDialog } from './WebImagePickerDialog';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Item {
  id: string;
  name: string;
  category: ProductCategory;
  ip_name: string | null;
  summary: string | null;
  era: string | null;
  origin: string | null;
  cover_url: string | null;
  selling_points: unknown;
  tips: string | null;
  importance_score: number;
  video_url: string | null;
  body: string | null;
  gallery: unknown;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: Item;
  onSaved: () => void;
  onDeleted?: () => void;
}

export function KnowledgeRichEditDialog({ open, onOpenChange, item, onSaved, onDeleted }: Props) {
  const [draft, setDraft] = useState<Item>(item);
  const [pointsText, setPointsText] = useState('');
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(item);
    setPointsText(
      Array.isArray(item.selling_points)
        ? (item.selling_points as unknown[]).map((p: any) => typeof p === 'string' ? p : (p?.text ?? '')).filter(Boolean).join('\n')
        : '',
    );
    const g = Array.isArray(item.gallery) ? (item.gallery as string[]).filter(Boolean) : [];
    if (g.length) setGallery(g);
    else if (item.cover_url) setGallery([item.cover_url]);
    else setGallery([]);
  }, [open, item]);

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of arr) {
        if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} 超过 8MB，已跳过`); continue; }
        const compressed = await compressForUpload(f, 1600, 0.82);
        const ext = compressed.type === 'image/jpeg' ? 'jpg' : (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `official-gallery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('product-images').upload(path, compressed, { contentType: compressed.type || f.type, ...UPLOAD_CACHE_OPTS });
        if (error) { toast.error(`上传失败：${error.message}`); continue; }
        const { data } = supabase.storage.from('product-images').getPublicUrl(path);
        if (data?.publicUrl) uploaded.push(data.publicUrl);
      }
      if (uploaded.length) {
        setGallery((prev) => [...prev, ...uploaded]);
        toast.success(`已上传 ${uploaded.length} 张`);
      }
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (i: number) => setGallery((p) => p.filter((_, idx) => idx !== i));
  const setCover = (i: number) => {
    if (i === 0) return;
    setGallery((p) => [p[i], ...p.filter((_, idx) => idx !== i)]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setGallery((items) => {
      const oldIndex = items.indexOf(String(active.id));
      const newIndex = items.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const save = async () => {
    if (!draft.name?.trim()) { toast.error('名称必填'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('official_knowledge').update({
        name: draft.name.trim(),
        category: draft.category,
        ip_name: draft.ip_name?.trim() || null,
        summary: draft.summary?.trim() || null,
        era: draft.era?.trim() || null,
        origin: draft.origin?.trim() || null,
        cover_url: gallery[0] || null,
        gallery,
        video_url: draft.video_url?.trim() || null,
        body: draft.body?.trim() || null,
        selling_points: pointsText.split('\n').map((s) => s.trim()).filter(Boolean),
        tips: draft.tips?.trim() || null,
        importance_score: Math.min(100, Math.max(0, Number(draft.importance_score) || 0)),
      }).eq('id', draft.id);
      if (error) throw error;
      toast.success('已保存');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('保存失败：' + (e?.message ?? ''));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('official_knowledge').delete().eq('id', draft.id);
      if (error) throw error;
      toast.success('已删除');
      setConfirmDelete(false);
      onOpenChange(false);
      onDeleted?.();
    } catch (e: any) {
      toast.error('删除失败：' + (e?.message ?? ''));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0"><DialogTitle>编辑词条</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-3">
          <div>
            <Label>名称 *</Label>
            <Input value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>品类</Label>
              <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v as ProductCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>IP / 系列</Label>
              <Input value={draft.ip_name || ''} onChange={(e) => setDraft({ ...draft, ip_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>年代</Label>
              <Input value={draft.era || ''} onChange={(e) => setDraft({ ...draft, era: e.target.value })} />
            </div>
            <div>
              <Label>产地</Label>
              <Input value={draft.origin || ''} onChange={(e) => setDraft({ ...draft, origin: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>简介</Label>
            <Textarea rows={2} value={draft.summary || ''} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          </div>

          {/* 图片（含主图） */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">
                图片 {gallery.length > 0 && <span className="text-xs text-muted-foreground font-normal">({gallery.length})</span>}
                <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                  第一张为主图{gallery.length > 1 ? ' · 长按拖动排序' : ''}
                </span>
              </Label>
            </div>

            {gallery.length ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={gallery} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-3 gap-2">
                    {gallery.map((u, i) => (
                      <SortableImage
                        key={u}
                        url={u}
                        index={i}
                        isCover={i === 0}
                        onRemove={() => removeAt(i)}
                        onSetCover={() => setCover(i)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-md">
                {uploading ? '正在上传…' : (searching ? '正在联网搜索…' : '尚无图片，请上传或联网搜图')}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 mt-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                上传图片
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1"
                onClick={() => {
                  if (!draft.name?.trim()) { toast.error('请先填写名称'); return; }
                  setPickerOpen(true);
                }}>
                <Globe className="w-3 h-3" />
                联网搜图
              </Button>
            </div>
          </div>

          <div>
            <Label>视频 URL（MP4 直链或 YouTube/Bilibili 嵌入链接）</Label>
            <Input value={draft.video_url || ''} onChange={(e) => setDraft({ ...draft, video_url: e.target.value })} placeholder="https://...mp4" />
          </div>
          <div>
            <Label>正文（支持 Markdown）</Label>
            <Textarea rows={6} value={draft.body || ''} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="可分段介绍历史背景、辨别要点、保养方法…" />
          </div>
          <div>
            <Label>核心卖点（每行一条）</Label>
            <Textarea rows={4} value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
          </div>
          <div>
            <Label>小贴士</Label>
            <Textarea rows={2} value={draft.tips || ''} onChange={(e) => setDraft({ ...draft, tips: e.target.value })} />
          </div>
          <div>
            <Label>重要程度（0–100）</Label>
            <Input type="number" min={0} max={100}
              value={draft.importance_score ?? 0}
              onChange={(e) => setDraft({ ...draft, importance_score: Number(e.target.value) })} />
          </div>

          {/* 危险操作区 — 不固定，需滚到底才能看到 */}
          <div className="mt-8 pt-4 border-t border-destructive/20">
            <div className="text-xs text-muted-foreground mb-2">危险操作</div>
            <Button
              type="button"
              variant="destructive"
              className="w-full gap-1.5"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="w-4 h-4" />
              删除此词条
            </Button>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              删除后无法恢复，词条的图片、正文、卖点等全部内容都会丢失。
            </p>
          </div>
        </div>
        <div className="shrink-0 bg-background border-t px-6 py-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}保存
          </Button>
        </div>
      </DialogContent>
      <WebImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialQuery={draft.name || ''}
        pathPrefix="web-gallery"
        onConfirm={(urls) => setGallery((prev) => Array.from(new Set([...prev, ...urls])))}
      />

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>
              即将永久删除「{draft.name}」，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function SortableImage({
  url, index, isCover, onRemove, onSetCover,
}: {
  url: string;
  index: number;
  isCover: boolean;
  onRemove: () => void;
  onSetCover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    touchAction: 'manipulation',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative rounded-md border overflow-hidden bg-muted aspect-square select-none"
    >
      {/* 拖动热区：覆盖整张图，长按触发 */}
      <div
        {...attributes}
        {...listeners}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        aria-label="长按拖动排序"
      >
        <img src={url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
      </div>
      {isCover && (
        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-0.5 pointer-events-none">
          <Star className="w-2.5 h-2.5 fill-current" /> 主图
        </div>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="absolute top-1 right-1 bg-background/90 hover:bg-destructive hover:text-destructive-foreground rounded-full p-1 shadow-sm z-10"
        title="删除"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1 z-10">
        <div className="bg-background/80 rounded p-0.5 pointer-events-none">
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
        {!isCover && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onSetCover}
            className="bg-background/90 rounded p-0.5"
            title="设为主图"
          >
            <Star className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

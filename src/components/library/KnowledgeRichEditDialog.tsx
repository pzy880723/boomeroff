import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CATEGORY_LABELS, CATEGORY_ORDER, ProductCategory } from '@/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
}

export function KnowledgeRichEditDialog({ open, onOpenChange, item, onSaved }: Props) {
  const [draft, setDraft] = useState<Item>(item);
  const [pointsText, setPointsText] = useState('');
  const [galleryText, setGalleryText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(item);
    setPointsText(
      Array.isArray(item.selling_points)
        ? (item.selling_points as unknown[]).map((p: any) => typeof p === 'string' ? p : (p?.text ?? '')).filter(Boolean).join('\n')
        : '',
    );
    setGalleryText(Array.isArray(item.gallery) ? (item.gallery as string[]).join('\n') : '');
  }, [open, item]);

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
        cover_url: draft.cover_url?.trim() || null,
        video_url: draft.video_url?.trim() || null,
        body: draft.body?.trim() || null,
        selling_points: pointsText.split('\n').map((s) => s.trim()).filter(Boolean),
        gallery: galleryText.split('\n').map((s) => s.trim()).filter(Boolean),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>编辑词条</DialogTitle></DialogHeader>
        <div className="space-y-3">
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
          <div>
            <Label>封面图 URL</Label>
            <Input value={draft.cover_url || ''} onChange={(e) => setDraft({ ...draft, cover_url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <Label>视频 URL（MP4 直链或 YouTube/Bilibili 嵌入链接）</Label>
            <Input value={draft.video_url || ''} onChange={(e) => setDraft({ ...draft, video_url: e.target.value })} placeholder="https://...mp4" />
          </div>
          <div>
            <Label>图集（每行一个 URL）</Label>
            <Textarea rows={3} value={galleryText} onChange={(e) => setGalleryText(e.target.value)} placeholder="https://..." />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 给单张素材改 tags / category 的轻量对话框
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';

export const DEFAULT_TAGS = ['门头', '商品', '人物', '场景', '细节', '价签'];
export const DEFAULT_CATEGORIES = ['门店', '商品', '人物', '其他'];

export function AssetTagDialog({
  open, onOpenChange, assetId, initialTags, initialCategory, suggestedTags = [], onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assetId: string | null;
  initialTags: string[];
  initialCategory: string | null;
  suggestedTags?: string[];
  onSaved?: (tags: string[], category: string | null) => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTags(initialTags || []);
      setCategory(initialCategory || null);
      setInput('');
    }
  }, [open, initialTags, initialCategory]);

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };
  const addCustom = () => {
    const v = input.trim();
    if (!v) return;
    if (!tags.includes(v)) setTags([...tags, v]);
    setInput('');
  };

  const save = async () => {
    if (!assetId) return;
    setSaving(true);
    const { error } = await supabase
      .from('marketing_assets' as any)
      .update({ tags, category })
      .eq('id', assetId);
    setSaving(false);
    if (error) { toast.error(error.message || '保存失败'); return; }
    toast.success('已保存');
    onSaved?.(tags, category);
    onOpenChange(false);
  };

  const suggestionPool = Array.from(new Set([...DEFAULT_TAGS, ...suggestedTags]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">标签与品类</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">品类(单选)</p>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(category === c ? null : c)}
                  className={[
                    'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                    category === c ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border hover:border-accent/40',
                  ].join(' ')}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">标签(可多选 / 自定义)</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {suggestionPool.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={[
                    'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
                    tags.includes(t) ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border hover:border-accent/40',
                  ].join(' ')}
                >
                  {t}
                </button>
              ))}
            </div>
            {tags.filter((t) => !suggestionPool.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.filter((t) => !suggestionPool.includes(t)).map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                    {t}
                    <button onClick={() => toggleTag(t)} aria-label="移除"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                placeholder="自定义标签"
                className="h-8 text-[12px]"
              />
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={addCustom} disabled={!input.trim()}>
                添加
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1" onClick={save} disabled={saving || !assetId}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

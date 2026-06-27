// 给单张素材改 tags / category 的轻量对话框
// 重构:固定搜索栏 + 热门标签 + 分组滚动 + 多选
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, X, Search, Plus } from 'lucide-react';

export const DEFAULT_CATEGORIES = ['分镜头', '门店', '商品', '人物', '其他'];

// 分组标签字典
export const TAG_GROUPS: { label: string; icon: string; tags: string[] }[] = [
  { label: '场景位置', icon: '📍', tags: ['门头', '店招', '店内', '橱窗', '货架', '收银台', '试穿区', '街拍', '门口'] },
  { label: '商品', icon: '🛍', tags: ['商品', '价签', '细节', '特写', '套装', '配饰', '材质', '摆件'] },
  { label: '人物', icon: '👤', tags: ['人物', '博主', '顾客', '店员', '主角', '合影'] },
  { label: '分镜头', icon: '🎬', tags: ['分镜头', '开场', '过渡', '结尾', '空镜', '特效'] },
  { label: '风格氛围', icon: '🎨', tags: ['复古', '文艺', '潮流', '温馨', '高级感', '夜景', '白天', '场景'] },
];

// flatten 后保持向后兼容
export const ALL_PRESET_TAGS = Array.from(new Set(TAG_GROUPS.flatMap((g) => g.tags)));
export const DEFAULT_TAGS = ALL_PRESET_TAGS;

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
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTags(initialTags || []);
      setCategory(initialCategory || null);
      setQuery('');
    }
  }, [open, initialTags, initialCategory]);

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const addCustom = (raw?: string) => {
    const v = (raw ?? query).trim();
    if (!v) return;
    if (!tags.includes(v)) setTags((prev) => [...prev, v]);
    setQuery('');
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

  // 热门标签:已选 + 外部建议,取前 12
  const hotTags = useMemo(() => {
    const pool: string[] = [];
    for (const t of tags) pool.push(t);
    for (const t of suggestedTags) if (!pool.includes(t)) pool.push(t);
    // 补一些高频默认
    for (const t of ['门头', '商品', '人物', '分镜头', '细节', '场景']) {
      if (!pool.includes(t)) pool.push(t);
    }
    return pool.slice(0, 12);
  }, [tags, suggestedTags]);

  const q = query.trim().toLowerCase();
  const filterTag = (t: string) => !q || t.toLowerCase().includes(q);

  // 自定义标签 = 已选中但不在任何预设/热门里
  const presetSet = useMemo(() => new Set([...ALL_PRESET_TAGS, ...hotTags]), [hotTags]);
  const customTags = tags.filter((t) => !presetSet.has(t));

  const filteredGroups = TAG_GROUPS.map((g) => ({ ...g, tags: g.tags.filter(filterTag) }));
  const filteredHot = hotTags.filter(filterTag);
  const filteredCustom = customTags.filter(filterTag);
  const anyMatch = filteredHot.length + filteredCustom.length + filteredGroups.reduce((s, g) => s + g.tags.length, 0) > 0;
  const canCreate = q.length > 0 && !tags.includes(query.trim()) && !ALL_PRESET_TAGS.some((t) => t.toLowerCase() === q);

  const Chip = ({ t }: { t: string }) => {
    const active = tags.includes(t);
    return (
      <button
        onClick={() => toggleTag(t)}
        className={[
          'text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap',
          active ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border hover:border-accent/40',
        ].join(' ')}
      >
        {t}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 flex flex-col max-h-[85vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-base flex items-center justify-between">
            <span>标签与品类</span>
            {tags.length > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">已选 {tags.length}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 固定:搜索 + 品类 */}
        <div className="px-4 pb-2 space-y-2 border-b shrink-0 bg-background">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                placeholder="搜索 / 新建标签"
                className="h-8 pl-7 text-[12px]"
              />
            </div>
            {canCreate && (
              <Button size="sm" variant="outline" className="h-8 text-[11px] px-2 shrink-0" onClick={() => addCustom()}>
                <Plus className="w-3 h-3 mr-0.5" />新建
              </Button>
            )}
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground mb-1">品类(单选)</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DEFAULT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(category === c ? null : c)}
                  className={[
                    'text-[11px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap shrink-0',
                    category === c ? 'bg-accent text-accent-foreground border-accent' : 'bg-card border-border hover:border-accent/40',
                  ].join(' ')}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 可滚动:分组标签 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {filteredHot.length > 0 && (
            <section>
              <p className="text-[11px] text-muted-foreground mb-1.5">🔥 热门标签</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredHot.map((t) => <Chip key={t} t={t} />)}
              </div>
            </section>
          )}

          {filteredGroups.map((g) => g.tags.length === 0 ? null : (
            <section key={g.label}>
              <p className="text-[11px] text-muted-foreground mb-1.5">{g.icon} {g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.tags.map((t) => <Chip key={t} t={t} />)}
              </div>
            </section>
          ))}

          {filteredCustom.length > 0 && (
            <section>
              <p className="text-[11px] text-muted-foreground mb-1.5">✨ 自定义</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredCustom.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-[11px] pl-2.5 pr-1.5 py-1 rounded-full bg-accent text-accent-foreground">
                    {t}
                    <button onClick={() => toggleTag(t)} aria-label="移除" className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          {!anyMatch && (
            <div className="py-8 text-center text-[12px] text-muted-foreground">
              {q ? <>没有匹配的标签{canCreate && <>,按回车新建「{query.trim()}」</>}</> : '暂无标签'}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 p-3 border-t shrink-0 bg-background">
          <Button variant="outline" className="flex-1 h-9" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1 h-9" onClick={save} disabled={saving || !assetId}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

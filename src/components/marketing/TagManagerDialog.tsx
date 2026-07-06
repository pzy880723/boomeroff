// 标签管理:列出当前素材列表里所有标签,支持重命名/合并/删除。
// 影响范围:当前已加载的 items(与页面看到的一致)。
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Pencil, Trash2, Merge, Search, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: any[]; // 当前页面加载的素材
  onUpdated: (updater: (prev: any[]) => any[]) => void;
}

type Mode = null | { kind: 'rename' | 'merge'; tag: string };

export function TagManagerDialog({ open, onOpenChange, items, onUpdated }: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [inputVal, setInputVal] = useState('');

  const tagStats = useMemo(() => {
    const freq = new Map<string, number>();
    items.forEach((it) => (Array.isArray(it.tags) ? it.tags : []).forEach((t: string) => {
      const k = String(t || '').trim();
      if (!k) return;
      freq.set(k, (freq.get(k) || 0) + 1);
    }));
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [items]);

  const q = query.trim().toLowerCase();
  const filtered = q ? tagStats.filter((t) => t.tag.toLowerCase().includes(q)) : tagStats;

  const applyBatch = async (oldTag: string, newTag: string | null) => {
    // newTag === null → 删除;否则重命名/合并
    const affected = items.filter((it) => Array.isArray(it.tags) && it.tags.includes(oldTag));
    if (!affected.length) return;
    setBusy(true);
    try {
      const updates = affected.map((it) => {
        let next = (it.tags as string[]).filter((t) => t !== oldTag);
        if (newTag && !next.includes(newTag)) next = [...next, newTag];
        return { id: it.id, tags: next };
      });
      // 逐条 update(数量通常不大)
      for (const u of updates) {
        const { error } = await supabase
          .from('marketing_assets' as any)
          .update({ tags: u.tags })
          .eq('id', u.id);
        if (error) throw error;
      }
      onUpdated((prev) => prev.map((it) => {
        const hit = updates.find((u) => u.id === it.id);
        return hit ? { ...it, tags: hit.tags } : it;
      }));
      toast.success(
        newTag === null
          ? `已从 ${updates.length} 条素材移除「${oldTag}」`
          : `已将 ${updates.length} 条素材的「${oldTag}」改为「${newTag}」`,
      );
      setMode(null);
      setInputVal('');
    } catch (e: any) {
      toast.error(e?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const startRename = (t: string) => { setMode({ kind: 'rename', tag: t }); setInputVal(t); };
  const startMerge = (t: string) => { setMode({ kind: 'merge', tag: t }); setInputVal(''); };
  const doDelete = (t: string) => {
    if (!confirm(`从所有素材里移除标签「${t}」?(不会删除素材本身)`)) return;
    applyBatch(t, null);
  };

  const confirmEdit = () => {
    if (!mode) return;
    const v = inputVal.trim();
    if (!v) { toast.error('请输入标签名'); return; }
    if (v === mode.tag) { setMode(null); return; }
    applyBatch(mode.tag, v);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setMode(null); setInputVal(''); } onOpenChange(v); }}>
      <DialogContent className="max-w-sm p-0 gap-0 flex flex-col max-h-[85vh]">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-base flex items-center justify-between">
            <span>标签管理</span>
            <span className="text-[11px] font-normal text-muted-foreground">共 {tagStats.length} 个</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2 shrink-0 border-b bg-background">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标签"
              className="h-8 pl-7 text-[12px]"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 mb-1">
            仅影响当前列表内已加载的 {items.length} 条素材
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-[12px] text-muted-foreground">
              {q ? '没有匹配的标签' : '暂无标签'}
            </div>
          )}
          {filtered.map(({ tag, count }) => {
            const editing = mode && mode.tag === tag;
            return (
              <div key={tag} className="px-2 py-2 border-b border-border/60 last:border-0">
                {editing ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      {mode!.kind === 'rename' ? '重命名' : '合并到'}「{tag}」→
                    </p>
                    <div className="flex gap-1.5">
                      <Input
                        autoFocus
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); }}
                        placeholder={mode!.kind === 'rename' ? '新名称' : '目标标签'}
                        className="h-8 text-[12px]"
                      />
                      <Button size="sm" className="h-8 px-2" onClick={confirmEdit} disabled={busy}>
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => { setMode(null); setInputVal(''); }} disabled={busy}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium truncate flex-1">{tag}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{count}</span>
                    <div className="flex gap-0.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => startRename(tag)} title="重命名">
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => startMerge(tag)} title="合并到另一个标签">
                        <Merge className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-destructive hover:text-destructive" onClick={() => doDelete(tag)} title="删除">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

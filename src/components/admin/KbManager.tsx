import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, Pencil, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Cat { id?: string; type: 'sop'|'qa'; name: string; sort_order: number }
interface Entry { id?: string; type: 'sop'|'qa'; category_id: string | null; title: string; body: string; tags: string[]; sort_order: number }

interface Props { type: 'sop' | 'qa'; title: string }

export function KbManager({ type, title }: Props) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [catDraft, setCatDraft] = useState<Cat | null>(null);
  const [entryDraft, setEntryDraft] = useState<Entry | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiHint, setAiHint] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('shop_kb_categories' as any).select('*').eq('type', type).order('sort_order'),
      supabase.from('shop_kb_entries' as any).select('*').eq('type', type).order('sort_order'),
    ]);
    setCats((c as any) || []);
    setEntries((e as any) || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [type]);

  const saveCat = async () => {
    if (!catDraft || !catDraft.name.trim()) return;
    const { id, ...payload } = catDraft;
    const { error } = id
      ? await supabase.from('shop_kb_categories' as any).update(payload).eq('id', id)
      : await supabase.from('shop_kb_categories' as any).insert(payload);
    if (error) toast.error(error.message); else { toast.success('已保存'); setCatDraft(null); refresh(); }
  };
  const delCat = async (id: string) => {
    if (!confirm('删除该分类？该分类下词条不会被删除，但会变为「未分类」')) return;
    await supabase.from('shop_kb_categories' as any).delete().eq('id', id);
    refresh();
  };

  const saveEntry = async () => {
    if (!entryDraft || !entryDraft.title.trim()) return;
    const { id, ...payload } = entryDraft;
    const { error } = id
      ? await supabase.from('shop_kb_entries' as any).update(payload).eq('id', id)
      : await supabase.from('shop_kb_entries' as any).insert(payload);
    if (error) toast.error(error.message); else { toast.success('已保存'); setEntryDraft(null); refresh(); }
  };
  const delEntry = async (id: string) => {
    if (!confirm('确认删除？')) return;
    await supabase.from('shop_kb_entries' as any).delete().eq('id', id);
    refresh();
  };

  const filtered = filterCat === 'all' ? entries : entries.filter(e => e.category_id === filterCat);

  const runAi = async () => {
    if (!aiTopic.trim()) { toast.error('请填写主题'); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-shop-kb', {
        body: {
          type,
          topic: aiTopic.trim(),
          hint: aiHint.trim(),
          categories: cats.map(c => ({ id: c.id, name: c.name })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const draft = (data as any).draft as { title: string; body: string; category_name: string; tags?: string[] };

      // match category by name (case-insensitive trim)
      const norm = (s: string) => s.trim().toLowerCase();
      let cat = cats.find(c => norm(c.name) === norm(draft.category_name));
      if (!cat) {
        const { data: newCat, error: e2 } = await supabase
          .from('shop_kb_categories' as any)
          .insert({ type, name: draft.category_name.trim(), sort_order: cats.length })
          .select().single();
        if (e2) throw e2;
        cat = newCat as any;
      }

      setAiOpen(false);
      setAiTopic(''); setAiHint('');
      await refresh();
      setEntryDraft({
        type,
        category_id: cat!.id || null,
        title: draft.title,
        body: draft.body,
        tags: draft.tags || [],
        sort_order: entries.length,
      });
      toast.success(`已生成草稿，分类：${cat!.name}`);
    } catch (e: any) {
      toast.error(e.message || 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">{title} · 分类</h3>
          <Button size="sm" onClick={() => setCatDraft({ type, name: '', sort_order: cats.length })}><Plus className="w-4 h-4 mr-1" />新增分类</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cats.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1 bg-muted rounded-full pl-3 pr-1 py-0.5 text-xs">
              {c.name}
              <button onClick={() => setCatDraft(c)} className="p-1 hover:bg-black/10 rounded-full"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => c.id && delCat(c.id)} className="p-1 hover:bg-black/10 rounded-full"><Trash2 className="w-3 h-3 text-destructive" /></button>
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h3 className="text-base font-semibold">{title} · 词条</h3>
          <div className="flex gap-2">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {cats.map(c => <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setAiOpen(true)}>
              <Sparkles className="w-4 h-4 mr-1" />AI 生成
            </Button>
            <Button size="sm" onClick={() => setEntryDraft({ type, category_id: cats[0]?.id || null, title: '', body: '', tags: [], sort_order: entries.length })}>
              <Plus className="w-4 h-4 mr-1" />新增词条
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground py-2">暂无</p>}
          {filtered.map(e => {
            const c = cats.find(x => x.id === e.category_id);
            return (
              <Card key={e.id} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{e.body || '（暂无说明）'}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">分类：{c?.name || '未分类'}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEntryDraft(e)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => e.id && delEntry(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* category dialog */}
      <Dialog open={!!catDraft} onOpenChange={(o) => !o && setCatDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{catDraft?.id ? '编辑' : '新增'}分类</DialogTitle></DialogHeader>
          {catDraft && (
            <div className="space-y-3">
              <div><Label>名称</Label><Input value={catDraft.name} onChange={e => setCatDraft({ ...catDraft, name: e.target.value })} /></div>
              <div><Label>排序</Label><Input type="number" value={catDraft.sort_order} onChange={e => setCatDraft({ ...catDraft, sort_order: +e.target.value || 0 })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setCatDraft(null)}>取消</Button><Button onClick={saveCat}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* entry dialog */}
      <Dialog open={!!entryDraft} onOpenChange={(o) => !o && setEntryDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{entryDraft?.id ? '编辑' : '新增'}词条</DialogTitle></DialogHeader>
          {entryDraft && (
            <div className="space-y-3">
              <div><Label>分类</Label>
                <Select value={entryDraft.category_id || ''} onValueChange={v => setEntryDraft({ ...entryDraft, category_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                  <SelectContent>{cats.map(c => <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>标题</Label><Input value={entryDraft.title} onChange={e => setEntryDraft({ ...entryDraft, title: e.target.value })} /></div>
              <div><Label>正文</Label><Textarea rows={6} value={entryDraft.body} onChange={e => setEntryDraft({ ...entryDraft, body: e.target.value })} /></div>
              <div><Label>标签（逗号分隔）</Label>
                <Input value={entryDraft.tags.join(',')} onChange={e => setEntryDraft({ ...entryDraft, tags: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })} />
              </div>
              <div><Label>排序</Label><Input type="number" value={entryDraft.sort_order} onChange={e => setEntryDraft({ ...entryDraft, sort_order: +e.target.value || 0 })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEntryDraft(null)}>取消</Button><Button onClick={saveEntry}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI generate dialog */}
      <Dialog open={aiOpen} onOpenChange={(o) => !aiLoading && setAiOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>AI 生成{title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>主题 / 标题</Label>
              <Input
                placeholder={type === 'qa' ? '例：客户砍价怎么应对' : '例：闭店流程'}
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                disabled={aiLoading}
              />
            </div>
            <div>
              <Label>补充说明（可选）</Label>
              <Textarea
                rows={3}
                placeholder="想强调的要点、限制条件、店内特殊情况等"
                value={aiHint}
                onChange={(e) => setAiHint(e.target.value)}
                disabled={aiLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              AI 会自动从 {cats.length} 个现有分类里匹配，匹配不上时会新建一个分类。生成后可在弹出的编辑框二次修改。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)} disabled={aiLoading}>取消</Button>
            <Button onClick={runAi} disabled={aiLoading}>
              {aiLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />生成中…</> : <><Sparkles className="w-4 h-4 mr-1" />开始生成</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, ChevronRight, Sparkles, Pencil, Trash2, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

interface Cat { id: string; name: string; sort_order: number }
interface Entry {
  id: string;
  category_id: string | null;
  title: string;
  body: string;
  tags: string[];
  sort_order: number;
}
type Draft = {
  id?: string;
  category_id: string | null;
  title: string;
  body: string;
  tags: string[];
  sort_order: number;
};

/** 轻量 markdown 渲染:支持 **加粗**、- 列表项、空行分段。 */
function renderBody(body: string) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuf: string[] = [];
  const flushList = () => {
    if (listBuf.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 my-2">
          {listBuf.map((t, i) => (
            <li key={i} className="text-sm leading-relaxed">{renderInline(t)}</li>
          ))}
        </ul>,
      );
      listBuf = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (line.startsWith('- ')) { listBuf.push(line.slice(2)); continue; }
    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-relaxed my-2 whitespace-pre-wrap">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return blocks;
}
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

export default function MyQa() {
  const { can } = usePermissions();
  const isAdmin = can('shop.kb.write');

  const [cats, setCats] = useState<Cat[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);

  // admin draft
  const [draft, setDraft] = useState<Draft | null>(null);
  const [aiHint, setAiHint] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('shop_kb_categories' as any).select('*').eq('type', 'qa').order('sort_order'),
      supabase.from('shop_kb_entries' as any).select('*').eq('type', 'qa').order('sort_order'),
    ]);
    setCats((c as any) || []);
    setEntries((e as any) || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const catName = (id: string | null) => cats.find(c => c.id === id)?.name || '未分类';

  const list = useMemo(() => {
    let r = entries;
    if (activeCat !== 'all') r = r.filter(x => x.category_id === activeCat);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      r = r.filter(
        x =>
          x.title.toLowerCase().includes(k) ||
          x.body.toLowerCase().includes(k) ||
          (x.tags || []).some(t => t.toLowerCase().includes(k)),
      );
    }
    return r;
  }, [entries, activeCat, q]);

  const preview = (body: string) =>
    body.replace(/\*\*/g, '').replace(/^-\s+/gm, '').replace(/\s+/g, ' ').trim();

  const openNewDraft = () => {
    setAiHint('');
    setDraft({
      category_id: cats[0]?.id || null,
      title: '',
      body: '',
      tags: [],
      sort_order: entries.length,
    });
  };

  const openEditDraft = (e: Entry) => {
    setAiHint('');
    setDraft({ ...e });
  };

  const runAi = async () => {
    if (!draft) return;
    const topic = draft.title.trim();
    if (!topic) { toast.error('请先填写标题或主题'); return; }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-shop-kb', {
        body: {
          type: 'qa',
          topic,
          hint: aiHint.trim(),
          categories: cats.map(c => ({ id: c.id, name: c.name })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = (data as any).draft as { title: string; body: string; category_name: string; tags?: string[] };
      const norm = (s: string) => s.trim().toLowerCase();
      let cat = cats.find(c => norm(c.name) === norm(d.category_name));
      if (!cat && d.category_name?.trim()) {
        const { data: newCat, error: e2 } = await supabase
          .from('shop_kb_categories' as any)
          .insert({ type: 'qa', name: d.category_name.trim(), sort_order: cats.length })
          .select().single();
        if (e2) throw e2;
        cat = newCat as any;
        await refresh();
      }
      setDraft({
        ...draft,
        category_id: cat?.id || draft.category_id,
        title: d.title || draft.title,
        body: d.body || draft.body,
        tags: d.tags?.length ? d.tags : draft.tags,
      });
      toast.success(`已生成${cat ? ` · 分类:${cat.name}` : ''}`);
    } catch (e: any) {
      toast.error(e?.message || 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const saveDraft = async () => {
    if (!draft || !draft.title.trim()) { toast.error('请填写标题'); return; }
    setSaving(true);
    const { id, ...payload } = draft;
    const { error } = id
      ? await supabase.from('shop_kb_entries' as any).update({ ...payload, type: 'qa' }).eq('id', id)
      : await supabase.from('shop_kb_entries' as any).insert({ ...payload, type: 'qa' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('已保存');
    setDraft(null);
    refresh();
  };

  const delEntry = async (e: Entry) => {
    if (!confirm(`确认删除「${e.title}」?`)) return;
    const { error } = await supabase.from('shop_kb_entries' as any).delete().eq('id', e.id);
    if (error) { toast.error(error.message); return; }
    toast.success('已删除');
    refresh();
  };

  return (
    <>
      <PageHeader title="顾客 Q&A" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索问题、关键词、标签…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Button onClick={openNewDraft} className="shrink-0 gap-1.5">
              <Wand2 className="w-4 h-4" />
              <span className="hidden sm:inline">AI 新增</span>
              <span className="sm:hidden">新增</span>
            </Button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
          {[{ id: 'all', name: '全部' } as any, ...cats].map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors',
                activeCat === c.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/60 text-foreground hover:bg-muted',
              )}
            >
              {c.name}
              {c.id !== 'all' && (
                <span className="ml-1 opacity-60 tabular-nums">
                  {entries.filter(e => e.category_id === c.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">暂无内容</Card>
        ) : (
          <div className="grid gap-2">
            {list.map((e) => (
              <Card
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenEntry(e)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') setOpenEntry(e); }}
                className="p-3 hover:bg-muted/40 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-snug">{e.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {preview(e.body) || '(暂无说明)'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {catName(e.category_id)}
                      </span>
                      {(e.tags || []).slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(ev) => ev.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDraft(e)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => delEntry(e)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      <Sheet open={!!openEntry} onOpenChange={(o) => !o && setOpenEntry(null)}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
          {openEntry && (
            <>
              <SheetHeader className="text-left">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {catName(openEntry.category_id)}
                  </span>
                </div>
                <SheetTitle className="text-base font-bold leading-snug">{openEntry.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-3 text-foreground/85">{renderBody(openEntry.body)}</div>
              {openEntry.tags?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap gap-1.5">
                  {openEntry.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              {isAdmin && (
                <div className="mt-5 pt-3 border-t border-border/50 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1"
                    onClick={() => { const e = openEntry; setOpenEntry(null); openEditDraft(e); }}>
                    <Pencil className="w-4 h-4 mr-1" />编辑
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-destructive"
                    onClick={() => { const e = openEntry; setOpenEntry(null); delEntry(e); }}>
                    <Trash2 className="w-4 h-4 mr-1" />删除
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 新增 / 编辑 对话框(管理员) */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>{draft?.id ? '编辑 QA' : '新增 QA'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-3">
              <div>
                <Label>分类</Label>
                <Select
                  value={draft.category_id || ''}
                  onValueChange={(v) => setDraft({ ...draft, category_id: v || null })}
                >
                  <SelectTrigger><SelectValue placeholder="选择分类(可空,AI 会自动匹配)" /></SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>标题 / 顾客的问题</Label>
                <Input
                  placeholder="例:这个东西能便宜点么?"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className="rounded-md border border-dashed border-border/60 p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">用自然语言让 AI 写正文</span>
                </div>
                <Textarea
                  rows={2}
                  placeholder="补充想法(可选):想强调什么、有什么前提条件、店内特殊情况等"
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  disabled={aiLoading}
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground flex-1">
                    AI 会从 {cats.length} 个现有分类里匹配;匹配不上会自动新建分类。
                  </p>
                  <Button size="sm" variant="outline" onClick={runAi} disabled={aiLoading || !draft.title.trim()}>
                    {aiLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />生成中…</> : <><Sparkles className="w-4 h-4 mr-1" />AI 生成</>}
                  </Button>
                </div>
              </div>
              <div>
                <Label>正文</Label>
                <Textarea
                  rows={8}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="支持 **加粗** 和 - 列表项"
                />
              </div>
              <div>
                <Label>标签(逗号分隔)</Label>
                <Input
                  value={draft.tags.join(',')}
                  onChange={(e) => setDraft({
                    ...draft,
                    tags: e.target.value.split(/[,,]/).map((s) => s.trim()).filter(Boolean),
                  })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>取消</Button>
            <Button onClick={saveDraft} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

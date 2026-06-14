import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface Cat { id: string; name: string; sort_order: number }
interface Entry {
  id: string;
  category_id: string | null;
  title: string;
  body: string;
  tags: string[];
  sort_order: number;
}

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
  // **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

export default function MyQa() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: e }] = await Promise.all([
        supabase.from('shop_kb_categories' as any).select('*').eq('type', 'qa').order('sort_order'),
        supabase.from('shop_kb_entries' as any).select('*').eq('type', 'qa').order('sort_order'),
      ]);
      setCats((c as any) || []);
      setEntries((e as any) || []);
      setLoading(false);
    })();
  }, []);

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

  return (
    <>
      <PageHeader title="顾客 Q&A" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索问题、关键词、标签…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
              <button
                key={e.id}
                onClick={() => setOpenEntry(e)}
                className="text-left"
              >
                <Card className="p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{e.title}</p>
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
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

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
                <SheetTitle className="text-base leading-snug">{openEntry.title}</SheetTitle>
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
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

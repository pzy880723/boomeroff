import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

interface Cat { id: string; name: string; sort_order: number }
interface Entry { id: string; category_id: string | null; title: string; body: string; tags: string[]; sort_order: number }

interface Props {
  type: 'sop' | 'qa';
  title: string;
}

export default function MyKb({ type, title }: Props) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: e }] = await Promise.all([
        supabase.from('shop_kb_categories' as any).select('*').eq('type', type).order('sort_order'),
        supabase.from('shop_kb_entries' as any).select('*').eq('type', type).order('sort_order'),
      ]);
      setCats((c as any) || []);
      setEntries((e as any) || []);
      setLoading(false);
    })();
  }, [type]);

  const list = useMemo(() => {
    let r = entries;
    if (activeCat !== 'all') r = r.filter(x => x.category_id === activeCat);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      r = r.filter(x => x.title.toLowerCase().includes(k) || x.body.toLowerCase().includes(k));
    }
    return r;
  }, [entries, activeCat, q]);

  return (
    <>
      <PageHeader title={title} back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={`搜索${title}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
          {[{ id: 'all', name: '全部' } as any, ...cats].map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs border transition-colors',
                activeCat === c.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/60 text-foreground hover:bg-muted'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">暂无内容</Card>
        ) : (
          <Card className="p-2">
            <Accordion type="multiple" className="w-full">
              {list.map(e => (
                <AccordionItem key={e.id} value={e.id} className="border-border/40">
                  <AccordionTrigger className="text-sm text-left hover:no-underline px-2">
                    <span className="flex-1">{e.title}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-2">
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{e.body || '（暂无说明）'}</div>
                    {e.tags?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.tags.map(t => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{t}</span>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        )}
      </div>
    </>
  );
}

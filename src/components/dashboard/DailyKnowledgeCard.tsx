import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BookOpen, Loader2, Sparkles } from 'lucide-react';

interface DailyContent {
  summary?: string;
  highlights?: string[];
  featured?: Array<{ name: string; point: string; image_url?: string | null }>;
}

export function DailyKnowledgeCard() {
  const { user } = useAuth();
  const [content, setContent] = useState<DailyContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!user) return;
    loadOrGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadOrGenerate = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('daily_knowledge')
      .select('content')
      .eq('date', today)
      .maybeSingle();

    if (data) {
      setContent(data.content as DailyContent);
      setLoading(false);
    } else {
      setLoading(false);
      generate();
    }
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-knowledge', {
        body: {},
      });
      if (error) throw error;
      if (data?.content) setContent(data.content as DailyContent);
    } catch (e) {
      console.error('[DailyKnowledge] generate error:', e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-9 px-2.5 sm:px-3 relative">
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">今日知识点</span>
          <span className="sm:hidden">知识</span>
          {content && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,420px)] p-0 overflow-hidden" align="start" sideOffset={8}>
        <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-surface border-b border-border/60">
          <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] leading-tight">今日知识点</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{today}</div>
          </div>
        </div>
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在加载...
              </div>
            )}

            {!loading && generating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在为今日生成知识点...
              </div>
            )}

            {!loading && !generating && !content && (
              <div className="text-sm text-muted-foreground">
                <p>暂无今日知识点。识别一些商品后会自动生成。</p>
                <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={generate}>
                  <Sparkles className="w-3 h-3 mr-1" />
                  立即生成
                </Button>
              </div>
            )}

            {content?.summary && (
              <p className="text-sm leading-relaxed text-foreground/90">{content.summary}</p>
            )}

            {content?.highlights && content.highlights.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">学习要点</div>
                <ul className="space-y-1.5">
                  {content.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed">
                      <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-accent" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {content?.featured && content.featured.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">重点商品速记</div>
                <div className="space-y-2">
                  {content.featured.map((f, i) => (
                    <div key={i} className="flex gap-2 p-2 bg-muted/60 rounded-lg">
                      {f.image_url && (
                        <img
                          src={f.image_url}
                          alt={f.name}
                          className="w-12 h-12 rounded-md object-cover shrink-0"
                        />
                      )}
                      <div className="text-xs min-w-0 flex-1">
                        <div className="font-medium truncate">{f.name}</div>
                        <div className="text-muted-foreground line-clamp-2">{f.point}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

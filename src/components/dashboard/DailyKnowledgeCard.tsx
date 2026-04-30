import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BookOpen, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';

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
  const [expanded, setExpanded] = useState(true);

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
      // 自动触发生成
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

  if (loading) {
    return null;
  }

  return (
    <Card className="border-border/60 shadow-soft overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-accent flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] leading-tight">今日知识点</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{today}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>
      {expanded && (
        <CardContent className="space-y-3 pt-0 pb-4 animate-fade-in">
          {generating && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在为今日生成知识点...
            </div>
          )}

          {!generating && !content && (
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
                    <span className="text-accent shrink-0 mt-1.5 w-1 h-1 rounded-full bg-accent" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {content?.featured && content.featured.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.15em] font-medium text-muted-foreground">重点商品速记</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {content.featured.map((f, i) => (
                  <div key={i} className="flex gap-2 p-2 bg-muted/60 rounded-lg hover-lift">
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
        </CardContent>
      )}
    </Card>
  );
}

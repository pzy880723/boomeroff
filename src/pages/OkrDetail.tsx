import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, Circle, Target } from 'lucide-react';

interface Okr {
  id: string; title: string; objective: string | null;
  key_results: any; key_actions: string | null; tags: string[] | null;
  period_start: string; period_end: string;
}

export default function OkrDetail() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [item, setItem] = useState<Okr | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;
    void (async () => {
      const { data } = await supabase.from('operation_okrs' as any)
        .select('id, title, objective, key_results, key_actions, tags, period_start, period_end')
        .eq('id', id).maybeSingle();
      setItem((data as any) ?? null);
      setLoading(false);
    })();
  }, [user, id]);

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  return (
    <div className="min-h-screen">
      <PageHeader title="门店 OKR 详情" />
      <main className="mx-auto max-w-screen-md px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !item ? (
          <div className="text-center py-16 text-muted-foreground text-sm">未找到 OKR</div>
        ) : (
          <>
            <Card className="p-4 border-border/60">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Target className="w-5 h-5" strokeWidth={1.75} />
                </span>
                <div className="flex-1 min-w-0">
                  <h1 className="text-base font-bold">{item.title}</h1>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.period_start} → {item.period_end}
                  </p>
                </div>
              </div>
              {item.objective && (
                <p className="text-sm text-foreground mt-3 whitespace-pre-wrap leading-relaxed">{item.objective}</p>
              )}
              {!!(item.tags?.length) && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {item.tags!.map((t, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              )}
            </Card>

            {Array.isArray(item.key_results) && item.key_results.length > 0 && (
              <Card className="p-4 border-border/60">
                <h2 className="text-sm font-bold mb-3">关键结果</h2>
                <ul className="space-y-2.5">
                  {item.key_results.map((k: any, i: number) => {
                    const done = k?.done || k?.completed || (typeof k?.progress === 'number' && k.progress >= 100);
                    const text = typeof k === 'string' ? k : (k?.title || k?.text || k?.name || `KR ${i + 1}`);
                    return (
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        {done ? (
                          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" strokeWidth={2.5} />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <span className={done ? 'text-muted-foreground line-through' : ''}>{text}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {item.key_actions && (
              <Card className="p-4 border-border/60">
                <h2 className="text-sm font-bold mb-2">关键动作</h2>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.key_actions}</p>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

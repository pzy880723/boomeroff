import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Loader2, Target, ChevronRight } from 'lucide-react';

interface Okr {
  id: string; title: string; objective: string | null;
  key_results: any; tags: string[] | null;
  period_start: string; period_end: string;
}

function progress(kr: any): number {
  if (!Array.isArray(kr) || !kr.length) return 0;
  const done = kr.filter((k: any) => k?.done || k?.completed || (typeof k?.progress === 'number' && k.progress >= 100)).length;
  return Math.round((done / kr.length) * 100);
}

export default function OkrList() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Okr[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: sp } = await supabase.from('staff_profiles' as any)
        .select('shop_id').eq('user_id', user.id).maybeSingle();
      const shopId = (sp as any)?.shop_id;
      if (!shopId) { setItems([]); setLoading(false); return; }
      const { data } = await supabase.from('operation_okrs' as any)
        .select('id, title, objective, key_results, tags, period_start, period_end')
        .eq('shop_id', shopId)
        .order('period_start', { ascending: false });
      setItems(((data as any[]) || []) as Okr[]);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <AuthPage />;

  return (
    <div className="min-h-screen">
      <PageHeader title="门店管理" />
      <main className="mx-auto max-w-screen-md px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !items.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <Target className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无门店 OKR</p>
          </div>
        ) : (
          <Card className="divide-y divide-border/60 border-border/60 overflow-hidden">
            {items.map(o => {
              const p = progress(o.key_results);
              return (
                <Link key={o.id} to={`/store/okr/${o.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50">
                  <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold line-clamp-1">{o.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {o.period_start} → {o.period_end}
                    </p>
                  </div>
                  <div className="text-sm font-bold text-primary tabular-nums shrink-0">{p}%</div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              );
            })}
          </Card>
        )}
      </main>
    </div>
  );
}

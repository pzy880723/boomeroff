import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Loader2, Image as ImageIcon, FileText, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function MarketingLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('marketing_assets' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60);
      setItems((data as any[]) || []);
      setLoading(false);
    })();
  }, [user]);

  // 按月份分组
  const groups = useMemo(() => {
    const map = new Map<string, any[]>();
    const now = new Date();
    const thisYM = `${now.getFullYear()}-${now.getMonth()}`;
    items.forEach((it) => {
      const d = new Date(it.created_at);
      const ym = `${d.getFullYear()}-${d.getMonth()}`;
      const key = ym === thisYM
        ? '本月'
        : `${d.getFullYear()} · ${String(d.getMonth() + 1).padStart(2, '0')} 月`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    });
    return Array.from(map.entries());
  }, [items]);

  return (
    <>
      <PageHeader title="素材库" back="/me/marketing" subtitle="营销中心 / 历史产出" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 space-y-5 pb-12">
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">还没有产出</p>
        )}

        {groups.map(([key, list]) => (
          <section key={key} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="w-1 h-1 rounded-full bg-accent" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{key}</span>
              <span className="text-[10px] text-muted-foreground ml-1">{list.length} 条</span>
              <span className="flex-1 h-px bg-border ml-2" />
            </div>
            {list.map((it) => (
              <div
                key={it.id}
                className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-3 flex gap-3 transition-colors hover:border-accent/40"
              >
                <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                  {it.output_url && it.kind === 'photo' ? (
                    <img src={it.output_url} alt="" className="w-full h-full object-cover" />
                  ) : it.kind === 'copy' ? (
                    <FileText className="w-6 h-6 text-muted-foreground" />
                  ) : it.kind === 'video' ? (
                    <Video className="w-6 h-6 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[10px] text-accent tracking-[0.18em]">
                      {it.kind === 'photo' ? '图片' : it.kind === 'copy' ? '文案' : '视频'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(it.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {it.output_text && (
                    <p className="text-[12px] mt-1 line-clamp-2 text-foreground/85 leading-relaxed">
                      {it.output_text.slice(0, 120)}
                    </p>
                  )}
                  {it.meta?.platform && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">平台 · {it.meta.platform}</p>
                  )}
                  {it.kind === 'video' && it.meta?.status && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">状态 · {it.meta.status}</p>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

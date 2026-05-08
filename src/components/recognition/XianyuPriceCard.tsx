import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ExternalLink, ChevronDown, ChevronUp, RefreshCw, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Sample {
  title: string;
  price: number;
  url: string;
  sold?: boolean;
}

interface Snapshot {
  id?: string;
  product_id?: string | null;
  query_key?: string;
  display_name?: string | null;
  min_price: number | null;
  max_price: number | null;
  avg_price: number | null;
  suggested_price: number | null;
  sample_count: number;
  samples: Sample[];
  notes?: string | null;
  updated_at?: string;
}

interface Props {
  productId?: string;
  name: string;
  brand?: string;
  era?: string;
  category?: string;
  /** 管理员可重抓 */
  canRefetch?: boolean;
}

const fmt = (n: number | null | undefined) =>
  typeof n === 'number' ? `¥${Math.round(n).toLocaleString('zh-CN')}` : '—';

export function XianyuPriceCard({ productId, name, brand, era, category, canRefetch }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [empty, setEmpty] = useState(false);

  const fetchData = async (force = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-xianyu-price', {
        body: { productId, name, brand, era, category, force },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSnapshot(data?.snapshot ?? null);
      setEmpty(!!data?.empty);
      if (data?.empty) toast.info('未找到同款闲鱼数据');
    } catch (e: any) {
      toast.error(e?.message || '查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 只去缓存里看一眼，不主动触发抓取
  useEffect(() => {
    let alive = true;
    (async () => {
      const queryKey = [brand, name, era, category]
        .filter(Boolean)
        .map(s => String(s).trim().toLowerCase())
        .join(' | ')
        .replace(/\s+/g, ' ');
      const { data } = await supabase
        .from('xianyu_price_snapshots')
        .select('*')
        .eq('query_key', queryKey)
        .maybeSingle();
      if (alive && data) {
        setSnapshot(data as any);
        setEmpty((data as any).sample_count === 0);
      }
    })();
    return () => { alive = false; };
  }, [name, brand, era, category]);

  const updatedDate = snapshot?.updated_at
    ? new Date(snapshot.updated_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : null;

  return (
    <Card className="border-border/60 shadow-soft overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-display text-base leading-none">闲鱼行情参考</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">仅供参考 · 店内成交价以上方为准</p>
          </div>
        </div>
        {snapshot && canRefetch && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={loading}
            onClick={() => fetchData(true)}
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            重抓
          </Button>
        )}
      </div>

      <CardContent className="pt-0 pb-4">
        {!snapshot && !loading && (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fetchData(false)}
            >
              <Search className="w-4 h-4 mr-2" />
              查闲鱼行情
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              按需查询 · 约 5-10 秒 · 结果会缓存复用
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在抓取闲鱼同款…
          </div>
        )}

        {snapshot && !loading && empty && (
          <div className="text-sm text-muted-foreground py-2">
            {snapshot.notes || '暂无同款公开数据。'}
          </div>
        )}

        {snapshot && !loading && !empty && (
          <div className="space-y-3">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                价格区间
              </div>
              <div className="text-2xl font-display font-semibold leading-none">
                {fmt(snapshot.min_price)} <span className="text-muted-foreground text-base">~</span> {fmt(snapshot.max_price)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border bg-muted/20 p-2.5">
                <div className="text-[10px] text-muted-foreground">平均价</div>
                <div className="text-base font-semibold mt-0.5">{fmt(snapshot.avg_price)}</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                <div className="text-[10px] text-primary">建议挂牌</div>
                <div className="text-base font-semibold mt-0.5 text-primary">{fmt(snapshot.suggested_price)}</div>
              </div>
            </div>

            {snapshot.notes && (
              <p className="text-[13px] leading-relaxed text-foreground/85 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/40 dark:border-amber-800/30 rounded-lg px-3 py-2">
                {snapshot.notes}
              </p>
            )}

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>样本 {snapshot.sample_count} 条{updatedDate ? ` · 更新于 ${updatedDate}` : ''}</span>
              {snapshot.samples?.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-foreground hover:text-primary"
                  onClick={() => setShowSamples(v => !v)}
                >
                  {showSamples ? '收起样本' : '查看样本'}
                  {showSamples ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>

            {showSamples && snapshot.samples?.length > 0 && (
              <ul className="space-y-1.5 pt-1">
                {snapshot.samples.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-snug">
                    <Badge variant="outline" className="shrink-0 font-mono">{fmt(s.price)}</Badge>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-0 hover:text-primary inline-flex items-start gap-1"
                    >
                      <span className="line-clamp-2 break-all">{s.title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-60" />
                    </a>
                    {s.sold && (
                      <span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">已售</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

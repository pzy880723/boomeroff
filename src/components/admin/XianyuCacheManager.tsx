import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Loader2, RefreshCw, Trash2, Search, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Snapshot {
  id: string;
  product_id: string | null;
  query_key: string;
  display_name: string | null;
  min_price: number | null;
  max_price: number | null;
  avg_price: number | null;
  suggested_price: number | null;
  sample_count: number;
  samples: Array<{ title: string; price: number; url: string; sold?: boolean }>;
  notes: string | null;
  updated_at: string;
}

const fmt = (n: number | null) => (typeof n === 'number' ? `¥${Math.round(n).toLocaleString('zh-CN')}` : '—');

export function XianyuCacheManager() {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('xianyu_price_snapshots')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleRefetch = async (row: Snapshot) => {
    setRefetching(row.id);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-xianyu-price', {
        body: { productId: row.product_id, name: row.display_name || row.query_key, force: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('已重新抓取');
      await load();
    } catch (e: any) {
      toast.error(e?.message || '重抓失败');
    } finally {
      setRefetching(null);
    }
  };

  const handleDelete = async (row: Snapshot) => {
    if (!confirm(`删除 "${row.display_name || row.query_key}" 的缓存？`)) return;
    const { error } = await supabase.from('xianyu_price_snapshots').delete().eq('id', row.id);
    if (error) toast.error(error.message);
    else { toast.success('已删除'); await load(); }
  };

  const filtered = rows.filter(r =>
    !filter ||
    r.query_key.toLowerCase().includes(filter.toLowerCase()) ||
    (r.display_name || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="按商品名/关键词过滤"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          刷新列表
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        共 {filtered.length} 条缓存。门店店员的「查闲鱼行情」按钮命中这里直接返回，不会重复扣费。需要更新行情时点「重抓」。
      </p>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-8">暂无数据</div>
      )}

      <div className="space-y-2">
        {filtered.map((row) => (
          <Card key={row.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{row.display_name || row.query_key}</div>
                <div className="text-[11px] text-muted-foreground truncate">{row.query_key}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  disabled={refetching === row.id}
                  onClick={() => handleRefetch(row)}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refetching === row.id ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive"
                  onClick={() => handleDelete(row)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <Metric label="区间" value={`${fmt(row.min_price)}~${fmt(row.max_price)}`} />
              <Metric label="平均" value={fmt(row.avg_price)} />
              <Metric label="建议" value={fmt(row.suggested_price)} />
              <Metric label="样本" value={String(row.sample_count)} />
            </div>

            {row.notes && (
              <p className="text-[12px] text-muted-foreground leading-relaxed">{row.notes}</p>
            )}

            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>更新于 {new Date(row.updated_at).toLocaleString('zh-CN')}</span>
              {row.samples?.[0]?.url && (
                <a
                  href={row.samples[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 hover:text-primary"
                >
                  样本 <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded border bg-muted/20 px-2 py-1">
    <div className="text-[10px] text-muted-foreground">{label}</div>
    <div className="text-[12px] font-medium truncate">{value}</div>
  </div>
);

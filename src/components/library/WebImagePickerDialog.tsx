import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Search, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Candidate { url: string; source?: string }

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialQuery: string;
  pathPrefix?: string;
  onConfirm: (urls: string[]) => void;
}

export function WebImagePickerDialog({
  open, onOpenChange, initialQuery, pathPrefix = 'web-gallery', onConfirm,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<Candidate[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setItems([]);
      setSeen([]);
      setPicked(new Set());
      setFailed(new Set());
      // 自动搜一次
      void doSearch(initialQuery, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doSearch = async (q: string, exclude: string[]) => {
    if (!q.trim()) { toast.error('请输入搜索词'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('web-search-images', {
        body: { mode: 'search', query: q, intent: 'gallery', limit: 20, exclude },
      });
      if (error) throw error;
      const list: Candidate[] = (data?.images || []).filter((x: any) => x?.url);
      setItems(list);
      if (list.length === 0) toast.info('暂未搜到合适的图，可换关键词或点下一批');
    } catch (e: any) {
      toast.error('搜索失败：' + (e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const onSearch = () => {
    setSeen([]);
    setPicked(new Set());
    setFailed(new Set());
    void doSearch(query, []);
  };

  const onNextBatch = () => {
    const nextSeen = Array.from(new Set([...seen, ...items.map((i) => i.url)]));
    setSeen(nextSeen);
    setPicked(new Set());
    setFailed(new Set());
    void doSearch(query, nextSeen);
  };

  const togglePick = (url: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const onConfirmClick = async () => {
    const urls = Array.from(picked);
    if (urls.length === 0) return;
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke('web-search-images', {
        body: { mode: 'mirror', urls, pathPrefix },
      });
      if (error) throw error;
      const out: string[] = data?.images || [];
      const failedCount: number = data?.failed || 0;
      if (out.length === 0) {
        toast.error('选中的图全部下载失败，请换几张试试');
        return;
      }
      onConfirm(out);
      toast.success(`已加入 ${out.length} 张${failedCount ? `（${failedCount} 张失败已跳过）` : ''}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error('加入失败：' + (e?.message ?? ''));
    } finally {
      setConfirming(false);
    }
  };

  const visible = items.filter((i) => !failed.has(i.url));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>联网选图</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入商品名称"
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
          />
          <Button onClick={onSearch} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-1">搜索</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading && items.length === 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="aspect-square rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              暂无候选图
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {visible.map((it) => {
                const isPicked = picked.has(it.url);
                let host = '';
                try { host = new URL(it.source || it.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
                return (
                  <button
                    key={it.url}
                    type="button"
                    onClick={() => togglePick(it.url)}
                    className={`relative group aspect-square rounded overflow-hidden border-2 transition ${
                      isPicked ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                  >
                    <img
                      src={it.url}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={() => setFailed((p) => new Set(p).add(it.url))}
                      className="w-full h-full object-cover bg-muted"
                    />
                    {isPicked && (
                      <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                    {host && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/55 text-[10px] text-white px-1 py-0.5 truncate">
                        {host}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            已选 {picked.size} 张 · 共 {visible.length} 张候选
          </div>
          <Button variant="outline" onClick={onNextBatch} disabled={loading || items.length === 0}>
            <RefreshCw className="w-4 h-4 mr-1" /> 下一批
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>取消</Button>
          <Button onClick={onConfirmClick} disabled={picked.size === 0 || confirming}>
            {confirming ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            加入图集（{picked.size}）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

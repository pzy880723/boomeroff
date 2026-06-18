import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Check } from 'lucide-react';

export function LibraryImagePickerDialog({
  open, onOpenChange, shopId, max = 6, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shopId: string | null;
  max?: number;
  onConfirm: (urls: string[]) => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !user) return;
    setSel(new Set());
    (async () => {
      setLoading(true);
      let q = supabase
        .from('marketing_assets' as any)
        .select('id, output_url, shop_id, created_at')
        .eq('user_id', user.id)
        .eq('kind', 'photo')
        .not('output_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60);
      if (shopId) q = q.eq('shop_id', shopId);
      const { data } = await q;
      setItems((data as any[]) || []);
      setLoading(false);
    })();
  }, [open, user, shopId]);

  const toggle = (url: string) => {
    const next = new Set(sel);
    if (next.has(url)) next.delete(url);
    else { if (next.size >= max) return; next.add(url); }
    setSel(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">从素材库导入</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">
          {shopId ? '当前店铺下的图片素材' : '所有店铺图片素材'} · 最多 {max} 张 · 已选 {sel.size}
        </p>
        {loading ? (
          <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" /></div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">该店铺暂无图片素材</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((it) => {
              const url = it.output_url as string;
              const active = sel.has(url);
              return (
                <button key={it.id} onClick={() => toggle(url)}
                  className={[
                    'relative aspect-square rounded overflow-hidden border-2 transition-all',
                    active ? 'border-accent shadow-md' : 'border-transparent hover:border-accent/40',
                  ].join(' ')}>
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  {active && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="flex-1" disabled={!sel.size}
            onClick={() => { onConfirm(Array.from(sel)); onOpenChange(false); }}>
            导入 {sel.size} 张
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

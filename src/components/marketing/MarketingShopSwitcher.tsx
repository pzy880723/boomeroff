import { useState } from 'react';
import { Check, ChevronRight, MapPin, Store } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Shop } from '@/hooks/useShops';

export function MarketingShopSwitcher({
  value,
  shops,
  boundShopId,
  loading,
  onChange,
}: {
  value: string | null;
  shops: Shop[];
  boundShopId: string | null;
  loading: boolean;
  onChange: (shopId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = shops.find((shop) => shop.id === value) || null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading || shops.length === 0}
        className="w-full bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-3 flex items-center gap-3 text-left transition-all hover:border-accent/40 active:scale-[0.995] disabled:opacity-60"
      >
        <span className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Store className="w-5 h-5" strokeWidth={1.8} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.16em] text-accent font-semibold">当前门店</span>
          <span className="block text-[15px] font-semibold truncate mt-0.5">
            {loading ? '正在确认门店…' : current?.name || '请选择门店'}
          </span>
          <span className="block text-[11px] text-muted-foreground truncate mt-0.5">
            {current?.address || '内容、素材和发布账号均按当前门店'}
          </span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-[11px] font-semibold text-accent">
          切换 <ChevronRight className="w-3 h-3" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[75vh] overflow-hidden p-0 gap-0 rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-4 border-b text-left">
            <DialogTitle>切换当前门店</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              切换后，AI 创作、素材库和发布中心会同步使用该门店。
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto p-2 max-h-[58vh]">
            {shops.map((shop) => {
              const selected = shop.id === value;
              const bound = shop.id === boundShopId;
              return (
                <button
                  type="button"
                  key={shop.id}
                  onClick={() => {
                    onChange(shop.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selected ? 'bg-accent/[0.08]' : 'hover:bg-muted/60'}`}
                >
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border'}`}>
                    {selected && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{shop.name}</span>
                      {bound && <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">我的绑定门店</span>}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate mt-1">
                      <MapPin className="w-3 h-3 shrink-0" /> {shop.address || '暂未填写地址'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

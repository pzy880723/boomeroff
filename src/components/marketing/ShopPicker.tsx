import { useEffect } from 'react';
import { useShops, rememberShop } from '@/hooks/useShops';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store } from 'lucide-react';

/** 顶部强制选店组件，用于创建素材前。value=null 时不可继续。 */
export function ShopPicker({
  value, onChange, label = '店铺', required = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  required?: boolean;
}) {
  const { shops, loading } = useShops();

  // 自动 fallback：如果当前 value 不在列表里，清空
  useEffect(() => {
    if (!loading && value && !shops.find((s) => s.id === value)) onChange(null);
  }, [shops, loading, value, onChange]);

  return (
    <section className="bg-card rounded-[0.875rem] border border-accent/15 shadow-sm p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Store className="w-3.5 h-3.5 text-accent" />
        <span className="font-display text-[11px] text-accent tracking-[0.18em]">00</span>
        <span className="w-1 h-1 rounded-full bg-accent" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-accent font-semibold">{label}</span>
        {required && <span className="text-[10px] text-destructive ml-auto">必选</span>}
      </div>
      <Select
        value={value || ''}
        onValueChange={(v) => { onChange(v || null); rememberShop(v || null); }}
      >
        <SelectTrigger className="h-10 bg-transparent border-border">
          <SelectValue placeholder={loading ? '加载中…' : '请选择门店'} />
        </SelectTrigger>
        <SelectContent>
          {shops.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}{s.address ? ` · ${s.address}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!value && required && (
        <p className="text-[11px] text-muted-foreground">不同门店选品、客群不同，AI 会按所选店铺生成更贴合的内容。</p>
      )}
    </section>
  );
}

/** 横向 Chips：用于素材库筛选，支持「全部」「未分类」。 */
export function ShopFilterChips({
  value, onChange, includeAll = true, includeUnassigned = true,
}: {
  value: string | null | 'unassigned';
  onChange: (v: string | null | 'unassigned') => void;
  includeAll?: boolean;
  includeUnassigned?: boolean;
}) {
  const { shops } = useShops();
  const Chip = ({ active, onClick, children }: any) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-3 h-7 rounded-full text-[12px] transition-all border whitespace-nowrap shrink-0',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-card text-foreground border-border hover:border-accent/50',
      ].join(' ')}
    >{children}</button>
  );
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 scrollbar-none">
      {includeAll && <Chip active={value === null} onClick={() => onChange(null)}>全部</Chip>}
      {shops.map((s) => (
        <Chip key={s.id} active={value === s.id} onClick={() => onChange(s.id)}>{s.name}</Chip>
      ))}
      {includeUnassigned && <Chip active={value === 'unassigned'} onClick={() => onChange('unassigned')}>未分类</Chip>}
    </div>
  );
}

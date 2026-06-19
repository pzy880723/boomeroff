// 视频页"选择主角"组件：横滑选 + 新建
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, User, X } from 'lucide-react';
import { CharacterCreateDialog } from './CharacterCreateDialog';

export type Character = {
  id: string;
  name: string;
  role_label: string | null;
  cover_url: string;
  visual_signature: string | null;
  core_emotion: string | null;
  auto_anchor?: boolean;
};

export function CharacterPicker({
  shopId, value, onChange,
}: {
  shopId: string | null;
  value: Character | null;
  onChange: (c: Character | null) => void;
}) {
  const [items, setItems] = useState<Character[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!shopId) { setItems([]); return; }
    const { data } = await supabase
      .from('marketing_characters' as any)
      .select('id, name, role_label, cover_url, visual_signature, core_emotion, auto_anchor')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    setItems((data as any) || []);
  };
  useEffect(() => { load(); }, [shopId]);

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/30 rounded-md p-2">
          <img src={value.cover_url} className="w-10 h-10 object-cover rounded" alt="" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate">{value.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{value.role_label || '主角'}</p>
          </div>
          <button onClick={() => onChange(null)} className="p-1 hover:bg-background rounded" aria-label="取消选择">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => setOpen(true)}
          className="flex-shrink-0 w-16 h-16 rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:border-accent/50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-[9px]">新建</span>
        </button>
        {items.map((c) => {
          const active = value?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onChange(active ? null : c)}
              className={[
                'flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all relative',
                active ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-accent/40',
              ].join(' ')}
              title={c.name}
            >
              <img src={c.cover_url} className="w-full h-full object-cover" alt={c.name} />
              <span className="absolute inset-x-0 bottom-0 bg-black/65 text-white text-[8px] py-0.5 px-0.5 truncate">{c.name}</span>
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="flex-1 flex items-center text-[10px] text-muted-foreground pl-1">
            <User className="w-3 h-3 mr-1" />还没有角色,新建一个保持人物一致性
          </div>
        )}
      </div>
      <CharacterCreateDialog
        open={open}
        onOpenChange={setOpen}
        shopId={shopId}
        onCreated={(c) => { setItems((prev) => [c, ...prev]); onChange(c); }}
      />
    </div>
  );
}

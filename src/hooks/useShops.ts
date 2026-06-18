import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Shop { id: string; name: string; address?: string | null; }

const LS_KEY = 'marketing_last_shop';

export function rememberShop(id: string | null) {
  try {
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
  } catch {}
}
export function recallShop(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

export function useShops() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('shops')
        .select('id, name, address')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      setShops((data as any) || []);
      setLoading(false);
    })();
  }, []);
  return { shops, loading };
}

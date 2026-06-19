import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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

/**
 * 营销中心默认店铺解析：
 *   - 管理员：上次选择 > 自己门店 > 第一家
 *   - 店员：锁定自己门店（staff_profiles.shop_id），无法切换
 */
export function useEffectiveShop() {
  const { user, role } = useAuth();
  const { shops, loading: shopsLoading } = useShops();
  const isAdmin = role === 'admin';
  const [myShopId, setMyShopId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [shopId, setShopIdState] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  // 拉取自己门店
  useEffect(() => {
    if (!user) { setProfileLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('staff_profiles')
        .select('shop_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setMyShopId((data as any)?.shop_id || null);
      setProfileLoading(false);
    })();
  }, [user]);

  // 解析有效店铺
  useEffect(() => {
    if (shopsLoading || profileLoading) return;
    if (resolved) return;
    let effective: string | null = null;
    if (isAdmin) {
      const remembered = recallShop();
      if (remembered && shops.find((s) => s.id === remembered)) effective = remembered;
      else if (myShopId && shops.find((s) => s.id === myShopId)) effective = myShopId;
      else if (shops[0]) effective = shops[0].id;
    } else {
      if (myShopId && shops.find((s) => s.id === myShopId)) effective = myShopId;
      else if (shops[0]) effective = shops[0].id; // 兜底：没绑定就用第一家
    }
    setShopIdState(effective);
    setResolved(true);
  }, [shopsLoading, profileLoading, isAdmin, myShopId, shops, resolved]);

  const setShopId = (id: string | null) => {
    if (!isAdmin) return; // 店员不能切
    setShopIdState(id);
    rememberShop(id);
  };

  return {
    shopId,
    setShopId,
    shops,
    isAdmin,
    loading: shopsLoading || profileLoading || !resolved,
    myShopId,
  };
}

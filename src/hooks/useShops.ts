import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { resolveMarketingShop } from '@/lib/marketingShopSelection';

export interface Shop { id: string; name: string; address?: string | null; }

const LEGACY_LAST_SHOP_KEY = 'marketing_last_shop';
const LAST_SHOP_PREFIX = 'marketing_last_shop:';
const SESSION_SHOP_PREFIX = 'marketing_current_shop:';
const SHOP_CHANGE_EVENT = 'boomer.marketing.shop.change';

function storageKey(prefix: string, userId: string) {
  return `${prefix}${userId}`;
}

function readStorage(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

function writeStorage(storage: Storage, key: string, value: string | null) {
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    // Storage may be unavailable in privacy-restricted webviews.
  }
}

export function rememberShop(id: string | null, userId?: string) {
  writeStorage(localStorage, userId ? storageKey(LAST_SHOP_PREFIX, userId) : LEGACY_LAST_SHOP_KEY, id);
}

export function recallShop(userId?: string): string | null {
  if (!userId) return readStorage(localStorage, LEGACY_LAST_SHOP_KEY);
  return readStorage(localStorage, storageKey(LAST_SHOP_PREFIX, userId))
    || readStorage(localStorage, LEGACY_LAST_SHOP_KEY);
}

function rememberSessionShop(userId: string, shopId: string | null) {
  writeStorage(sessionStorage, storageKey(SESSION_SHOP_PREFIX, userId), shopId);
}

function recallSessionShop(userId: string): string | null {
  return readStorage(sessionStorage, storageKey(SESSION_SHOP_PREFIX, userId));
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
      setShops((data as Shop[] | null) || []);
      setLoading(false);
    })();
  }, []);
  return { shops, loading };
}

/**
 * 营销中心统一门店状态：绑定门店是首次默认值；手动切换在当前会话内同步到所有营销页面；
 * 未绑定门店的用户会长期恢复自己上一次选择。所有用户都允许切换。
 */
export function useEffectiveShop() {
  const { user, role, bootstrap } = useAuth();
  const { shops, loading: shopsLoading } = useShops();
  const isAdmin = role === 'admin';
  const [myShopId, setMyShopId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [shopId, setShopIdState] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setMyShopId(null);
      setProfileLoading(false);
      return;
    }
    const cachedShopId = bootstrap?.staff_profile?.shop_id || null;
    if (cachedShopId) {
      setMyShopId(cachedShopId);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfileLoading(true);
    void supabase
      .from('staff_profiles')
      .select('shop_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const profile = data as { shop_id?: string | null } | null;
        setMyShopId(profile?.shop_id || null);
        setProfileLoading(false);
      });
    return () => { active = false; };
  }, [user, bootstrap?.staff_profile?.shop_id]);

  useEffect(() => {
    if (!user || shopsLoading || profileLoading) return;
    if (resolvedUserId === user.id && shopId && shops.some((shop) => shop.id === shopId)) return;
    const effective = resolveMarketingShop({
      shopIds: shops.map((shop) => shop.id),
      boundShopId: myShopId,
      sessionShopId: recallSessionShop(user.id),
      rememberedShopId: recallShop(user.id),
    });
    setShopIdState(effective);
    rememberSessionShop(user.id, effective);
    if (!myShopId) rememberShop(effective, user.id);
    setResolvedUserId(user.id);
  }, [user, shopsLoading, profileLoading, resolvedUserId, shopId, shops, myShopId]);

  useEffect(() => {
    if (!user) return;
    const syncShop = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; shopId: string | null }>).detail;
      if (detail?.userId === user.id) setShopIdState(detail.shopId);
    };
    window.addEventListener(SHOP_CHANGE_EVENT, syncShop);
    return () => window.removeEventListener(SHOP_CHANGE_EVENT, syncShop);
  }, [user]);

  const setShopId = useCallback((id: string | null) => {
    if (!user) return;
    const next = id && shops.some((shop) => shop.id === id) ? id : null;
    setShopIdState(next);
    rememberSessionShop(user.id, next);
    if (!myShopId) rememberShop(next, user.id);
    window.dispatchEvent(new CustomEvent(SHOP_CHANGE_EVENT, {
      detail: { userId: user.id, shopId: next },
    }));
  }, [user, shops, myShopId]);

  return {
    shopId,
    setShopId,
    shops,
    isAdmin,
    canSwitch: true,
    loading: shopsLoading || profileLoading || resolvedUserId !== user?.id,
    myShopId,
  };
}

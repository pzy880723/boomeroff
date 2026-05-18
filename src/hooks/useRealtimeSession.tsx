import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product, CurrentSession } from '@/types';

/**
 * 私有化版本：只显示"当前登录店员自己最近一次识别"的商品。
 * 不再读写全局 current_session 表，避免串号显示别人的识别记录。
 */
export function useRealtimeSession() {
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      if (cancelled) return;
      setUid(userId);

      if (!userId) {
        setLoading(false);
        return;
      }

      await fetchLatestOwnProduct(userId);

      channel = supabase
        .channel(`own-products-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products', filter: `created_by=eq.${userId}` },
          (payload) => {
            if (payload.eventType === 'DELETE') return;
            const row = payload.new as any;
            if (row) hydrateProduct(row);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const hydrateProduct = (data: any) => {
    const sp = data.selling_points;
    const product: Product = {
      id: data.id,
      name: data.name,
      category: data.category,
      description: data.description || undefined,
      era: data.era || undefined,
      origin: data.origin || undefined,
      material: data.material || undefined,
      craft: data.craft || undefined,
      dimensions: data.dimensions || undefined,
      condition: data.condition || undefined,
      image_url: data.image_url || undefined,
      selling_points: Array.isArray(sp) ? (sp as string[]) : [],
      tips: data.tips || undefined,
      ai_analysis: data.ai_analysis as Record<string, unknown> | undefined,
      created_by: data.created_by || undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
    setCurrentProduct(product);
    setSession({
      id: data.id,
      product_id: data.id,
      operator_id: data.created_by,
      is_active: true,
      started_at: data.created_at,
      updated_at: data.updated_at,
    } as CurrentSession);
  };

  const fetchLatestOwnProduct = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching own latest product:', error);
      }
      if (data) hydrateProduct(data);
    } catch (e) {
      console.error('Error fetching own latest product:', e);
    } finally {
      setLoading(false);
    }
  };

  // 兼容旧签名：不再写全局 session，仅本地刷新展示。
  const updateSession = async (_productId: string, _operatorId: string) => {
    if (uid) await fetchLatestOwnProduct(uid);
  };

  const refetch = async () => {
    if (uid) await fetchLatestOwnProduct(uid);
  };

  return { currentProduct, session, loading, updateSession, refetch };
}

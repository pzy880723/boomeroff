import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product, CurrentSession } from '@/types';

export function useRealtimeSession() {
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 获取当前活跃的会话
    fetchCurrentSession();

    // 订阅会话变化
    const channel = supabase
      .channel('session-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'current_session',
        },
        async (payload) => {
          console.log('Session changed:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newSession = payload.new as CurrentSession;
            setSession(newSession);
            if (newSession.product_id) {
              await fetchProduct(newSession.product_id);
            } else {
              setCurrentProduct(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCurrentSession = async () => {
    try {
      const { data, error } = await supabase
        .from('current_session')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching session:', error);
      }

      if (data) {
        setSession(data);
        if (data.product_id) {
          await fetchProduct(data.product_id);
        }
      }
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProduct = async (productId: string) => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error) {
      console.error('Error fetching product:', error);
      return;
    }

    setCurrentProduct(data as Product);
  };

  const updateSession = async (productId: string, operatorId: string) => {
    try {
      // 先检查是否有活跃会话
      const { data: existingSession } = await supabase
        .from('current_session')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (existingSession) {
        // 更新现有会话
        await supabase
          .from('current_session')
          .update({
            product_id: productId,
            operator_id: operatorId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSession.id);
      } else {
        // 创建新会话
        await supabase
          .from('current_session')
          .insert({
            product_id: productId,
            operator_id: operatorId,
            is_active: true,
          });
      }
    } catch (error) {
      console.error('Error updating session:', error);
    }
  };

  return {
    currentProduct,
    session,
    loading,
    updateSession,
    refetch: fetchCurrentSession,
  };
}

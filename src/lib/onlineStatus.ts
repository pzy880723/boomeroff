// 基于 Supabase Realtime Presence 的全局在线状态
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

let channel: RealtimeChannel | null = null;
let refCount = 0;
const listeners = new Set<(ids: Set<string>) => void>();
let onlineIds = new Set<string>();

function emit() {
  for (const l of listeners) l(new Set(onlineIds));
}

async function ensureChannel(userId: string) {
  if (channel) return channel;
  channel = supabase.channel('presence:staff', {
    config: { presence: { key: userId } },
  });
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel!.presenceState() as Record<string, any[]>;
      onlineIds = new Set(Object.keys(state));
      emit();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel!.track({ at: new Date().toISOString() });
      }
    });
  return channel;
}

export function usePresence(userId: string | undefined) {
  const [online, setOnline] = useState<Set<string>>(onlineIds);

  useEffect(() => {
    if (!userId) return;
    refCount += 1;
    void ensureChannel(userId);
    const l = (ids: Set<string>) => setOnline(ids);
    listeners.add(l);
    setOnline(new Set(onlineIds));
    return () => {
      listeners.delete(l);
      refCount -= 1;
      if (refCount <= 0 && channel) {
        void supabase.removeChannel(channel);
        channel = null;
        onlineIds = new Set();
      }
    };
  }, [userId]);

  return online;
}

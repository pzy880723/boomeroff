import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getLevelInfo } from '@/lib/level';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Trophy } from 'lucide-react';

interface LevelUpInfo {
  newLevel: number;
  newTitle: string;
  gainedExp: number;
}

const baselineKey = (uid: string) => `level_up_baseline_exp_${uid}`;

export function LevelUpWatcher() {
  const { user } = useAuth();
  const [info, setInfo] = useState<LevelUpInfo | null>(null);
  const baselineRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const uid = user.id;

    (async () => {
      const { data } = await supabase
        .from('user_experience')
        .select('total_exp')
        .eq('user_id', uid)
        .maybeSingle();
      if (cancelled) return;
      const cur = (data as any)?.total_exp ?? 0;
      const stored = localStorage.getItem(baselineKey(uid));
      if (stored == null) {
        baselineRef.current = cur;
        localStorage.setItem(baselineKey(uid), String(cur));
      } else {
        baselineRef.current = Number(stored) || 0;
        // 处理"页面没开时升级"的场景:对比 stored 和 cur
        if (cur > baselineRef.current) {
          maybeTrigger(baselineRef.current, cur, uid);
        }
      }
    })();

    const channel = supabase
      .channel(`level-up-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_experience', filter: `user_id=eq.${uid}` },
        (payload) => {
          const newExp = (payload.new as any)?.total_exp ?? 0;
          const prev = baselineRef.current ?? newExp;
          maybeTrigger(prev, newExp, uid);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_experience', filter: `user_id=eq.${uid}` },
        (payload) => {
          const newExp = (payload.new as any)?.total_exp ?? 0;
          const prev = baselineRef.current ?? 0;
          maybeTrigger(prev, newExp, uid);
        }
      )
      .subscribe();

    function maybeTrigger(prev: number, next: number, _uid: string) {
      baselineRef.current = next;
      try { localStorage.setItem(baselineKey(_uid), String(next)); } catch {}
      if (next <= prev) return;
      const prevLv = getLevelInfo(prev).level;
      const newInfo = getLevelInfo(next);
      if (newInfo.level > prevLv) {
        setInfo({
          newLevel: newInfo.level,
          newTitle: newInfo.title,
          gainedExp: next - prev,
        });
      }
    }

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <Dialog open={!!info} onOpenChange={(o) => !o && setInfo(null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            等级提升 🎉
          </DialogTitle>
          <DialogDescription>
            恭喜你解锁新称号，继续加油！
          </DialogDescription>
        </DialogHeader>

        {info && (
          <div className="flex flex-col items-center text-center py-4 animate-fade-in">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-elegant mb-3">
              <Trophy className="w-9 h-9" />
            </div>
            <div className="text-3xl font-extrabold tracking-tight">Lv.{info.newLevel}</div>
            <div className="text-base font-semibold text-foreground mt-1">{info.newTitle}</div>
            <div className="mt-3 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold tabular-nums">
              本次获得 +{info.gainedExp} 经验
            </div>
          </div>
        )}

        <DialogFooter>
          <Button className="w-full" onClick={() => setInfo(null)}>知道了</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

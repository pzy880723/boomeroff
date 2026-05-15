import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Check, Camera, ClipboardCheck, Flame, ChevronRight } from 'lucide-react';
import { getLevelInfo, LEVELS } from '@/lib/level';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { useDashboardData } from '@/hooks/useDashboardData';

interface Props {
  data: ReturnType<typeof useDashboardData>;
  navigate: (p: string) => void;
}

export function LevelProgressCard({ data, navigate }: Props) {
  const info = getLevelInfo(data.totalExp);
  const nextTitle = info.isMax ? info.title : LEVELS[info.level]?.title || '';
  const remain = Math.max(0, info.expForNext - info.expIntoLevel);
  const [submitting, setSubmitting] = useState(false);

  const handleCheckIn = async () => {
    if (data.checkedToday || submitting) return;
    setSubmitting(true);
    const { data: r, error } = await supabase.rpc('perform_check_in');
    setSubmitting(false);
    if (error) { toast.error('签到失败'); return; }
    const result = r as any;
    if (!result?.already) {
      const bonus = result?.bonus ? `（连签 +${result.bonus}）` : '';
      toast.success(`签到 +${result?.exp_gained} 经验${bonus}`);
    }
    data.refresh();
  };

  const actions = [
    {
      key: 'checkin',
      icon: Flame,
      label: '每日签到',
      exp: '+3',
      done: data.checkedToday,
      doneText: '已签到',
      cta: '去签到',
      onClick: handleCheckIn,
      loading: submitting,
    },
    {
      key: 'scan',
      icon: Camera,
      label: '识别入库',
      exp: '+5',
      done: false,
      doneText: '',
      cta: '去识别',
      onClick: () => navigate('/scan'),
    },
    {
      key: 'quiz',
      icon: ClipboardCheck,
      label: '通过测试',
      exp: '+15',
      done: false,
      doneText: '',
      cta: '去做题',
      onClick: () => navigate('/library'),
    },
  ];

  return (
    <Card className="p-4 border-border/50 shadow-sm rounded-2xl">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              Lv.{info.level} · {info.title}
            </div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {info.totalExp} 经验
        </span>
      </div>

      <Progress value={Math.round(info.progress * 100)} className="h-2 mb-2" />

      <p className="text-xs text-muted-foreground mb-3">
        {info.isMax ? (
          <>已达最高等级 · {info.title} 🎉</>
        ) : (
          <>
            再获得 <span className="font-semibold text-foreground tabular-nums">{remain}</span> 经验升级到
            <span className="font-medium text-foreground"> Lv.{info.level + 1}「{nextTitle}」</span>
          </>
        )}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={a.done || a.loading}
              className={cn(
                'flex flex-col items-start gap-1 p-2.5 rounded-xl border transition-all text-left',
                a.done
                  ? 'border-primary/20 bg-primary/[0.04] cursor-default'
                  : 'border-border/60 bg-card hover:border-border hover:shadow-sm active:scale-[0.98]',
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Icon className={cn('w-3.5 h-3.5 shrink-0', a.done ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-[11px] text-muted-foreground truncate">{a.label}</span>
                <span className="ml-auto text-[10px] font-bold text-primary tabular-nums">{a.exp}</span>
              </div>
              <div className="flex items-center gap-0.5 text-xs font-medium">
                {a.done ? (
                  <>
                    <Check className="w-3 h-3 text-primary" />
                    <span className="text-primary">{a.doneText}</span>
                  </>
                ) : (
                  <>
                    <span className="text-foreground">{a.loading ? '处理中…' : a.cta}</span>
                    {!a.loading && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => navigate('/me')}
        className="mt-3 w-full text-[11px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-0.5"
      >
        查看全部经验规则 <ChevronRight className="w-3 h-3" />
      </button>
    </Card>
  );
}

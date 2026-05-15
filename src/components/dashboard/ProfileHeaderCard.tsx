import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RingProgress } from './primitives/RingProgress';
import { CountUp } from './primitives/CountUp';
import { getLevelInfo, LEVELS } from '@/lib/level';
import { Flame } from 'lucide-react';
import type { useDashboardData } from '@/hooks/useDashboardData';

interface Props {
  data: ReturnType<typeof useDashboardData>;
}

export function ProfileHeaderCard({ data }: Props) {
  const info = getLevelInfo(data.totalExp);
  const nextTitle = info.isMax ? info.title : LEVELS[info.level]?.title || '';
  const remain = Math.max(0, info.expForNext - info.expIntoLevel);
  const name = data.profile?.display_name || '店员';
  const shift = data.todayShift;

  return (
    <div className="relative px-5 pt-5 pb-4">
      <div className="flex items-center gap-4">
        {/* 头像 + 等级环 */}
        <div className="relative shrink-0">
          <RingProgress size={68} stroke={3} progress={info.progress}>
            <Avatar className="w-[58px] h-[58px] border border-white/10">
              <AvatarImage src={data.profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-white/10 text-white text-base">{name[0]}</AvatarFallback>
            </Avatar>
          </RingProgress>
          <span className="absolute -bottom-1 -right-1 min-w-[24px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-md tabular-nums">
            Lv.{info.level}
          </span>
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-semibold text-white truncate">{name}</span>
            <span className="text-[11px] text-white/55">{info.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {shift ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-white"
                style={{ background: shift.color || 'hsl(var(--primary))' }}
              >
                {shift.code} · {shift.name}
              </span>
            ) : (
              <span className="text-[11px] text-white/50 px-2 py-0.5 rounded-md bg-white/5">今日休息</span>
            )}
            {data.currentStreak > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/90">
                <Flame className="w-3 h-3" />
                连续 {data.currentStreak} 天
              </span>
            )}
          </div>
        </div>
      </div>

      {/* EXP 条 */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-white/55 mb-1.5 tabular-nums">
          <span>
            <CountUp value={info.totalExp} className="text-white/85 font-semibold" /> 经验
          </span>
          {info.isMax ? (
            <span className="text-white/55">已满级</span>
          ) : (
            <span>距 Lv.{info.level + 1}「{nextTitle}」还差 {remain}</span>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 animate-progress-fill"
            style={{ width: `${Math.round(info.progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

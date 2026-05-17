import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SectionCard } from './primitives/SectionCard';
import { Coffee, ChevronRight, MapPin } from 'lucide-react';
import { formatShiftTime } from '@/lib/scheduleUtils';
import type { useDashboardData } from '@/hooks/useDashboardData';

interface Props {
  data: ReturnType<typeof useDashboardData>;
  navigate: (p: string) => void;
}

export function SchedulePanel({ data, navigate }: Props) {
  const shift = data.todayShift;
  const peers = data.colleaguesToday || [];
  const tomorrow = data.weekShifts?.[1]?.shift ?? null;
  const hasTomorrowData = (data.weekShifts?.length ?? 0) >= 2;
  const shopName = data.shopName;

  return (
    <div className="space-y-3">
      {/* 今日班次 */}
      <SectionCard className="overflow-hidden" delay={0} onClick={() => navigate('/me')}>
        <div className="p-4 flex items-center gap-4">
          {shift ? (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md shrink-0"
              style={{ backgroundColor: shift.color || 'hsl(var(--accent))' }}
            >
              {shift.code}
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--accent)/0.08)] flex items-center justify-center shrink-0">
              <Coffee className="w-7 h-7 text-[hsl(var(--primary-foreground)/0.4)]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] tracking-[0.2em] text-[hsl(var(--primary-foreground)/0.45)]">今日班次</span>
              {shopName && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-[hsl(var(--primary-foreground)/0.55)]">
                  <MapPin className="w-2.5 h-2.5" />
                  {shopName}
                </span>
              )}
            </div>
            {shift ? (
              <>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-semibold text-[hsl(var(--primary-foreground))]">{shift.name}</span>
                  <span className="text-sm text-[hsl(var(--primary-foreground)/0.55)] tabular-nums">
                    {formatShiftTime(shift.start_time, shift.end_time)}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--primary-foreground)/0.45)] mt-1">
                  {peers.length > 0 ? `${peers.length} 位同事在岗` : '今日独自当班'}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-[hsl(var(--primary-foreground))]">今日休息</p>
                <p className="text-xs text-[hsl(var(--primary-foreground)/0.45)] mt-0.5">
                  {peers.length > 0 ? `今日门店 ${peers.length} 人在岗` : '好好放松一天'}
                </p>
              </>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-[hsl(var(--primary-foreground)/0.35)] shrink-0" />
        </div>
      </SectionCard>

      {/* 今日在岗（同店全员，含各班次） */}
      {peers.length > 0 && (
        <SectionCard className="p-4" delay={60}>
          <div className="text-[11px] tracking-[0.18em] text-[hsl(var(--primary-foreground)/0.5)] mb-3">今日在岗</div>
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {peers.map(c => (
              <div key={c.user_id + c.shift_code} className="flex flex-col items-center gap-1.5 shrink-0 w-14">
                <div className="relative">
                  <Avatar className="w-12 h-12 border border-[hsl(var(--accent)/0.2)]">
                    <AvatarImage src={c.avatar_url || undefined} />
                    <AvatarFallback className="bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--primary-foreground))] text-sm">
                      {(c.display_name || '同')[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold text-white border-2 border-[hsl(25_16%_13%)] flex items-center justify-center"
                    style={{ background: c.shift_color || 'hsl(var(--accent))' }}
                  >
                    {c.shift_code}
                  </span>
                </div>
                <span className="text-[11px] text-[hsl(var(--primary-foreground)/0.65)] truncate w-full text-center">
                  {c.display_name}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 明日 */}
      <SectionCard className="p-3 px-4" delay={120}>
        <div className="flex items-center gap-3">
          <div className="text-[10px] tracking-[0.2em] text-[hsl(var(--primary-foreground)/0.45)] shrink-0 w-10">明日</div>
          {tomorrow ? (
            <>
              <span
                className="px-1.5 py-0.5 rounded text-[11px] text-white font-medium shrink-0"
                style={{ background: tomorrow.color || 'hsl(var(--accent))' }}
              >
                {tomorrow.code}
              </span>
              <span className="text-sm text-[hsl(var(--primary-foreground)/0.85)] truncate">{tomorrow.name}</span>
              <span className="text-xs text-[hsl(var(--primary-foreground)/0.55)] tabular-nums ml-auto shrink-0">
                {formatShiftTime(tomorrow.start_time, tomorrow.end_time)}
              </span>
            </>
          ) : (
            <span className="text-sm text-[hsl(var(--primary-foreground)/0.55)]">
              {hasTomorrowData ? '明日休息' : '明日待排'}
            </span>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

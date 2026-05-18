import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Coffee, ChevronRight, Calendar } from 'lucide-react';
import { formatShiftTime, weekdayLabel } from '@/lib/scheduleUtils';
import { cn } from '@/lib/utils';
import type { useDashboardData } from '@/hooks/useDashboardData';

interface Props {
  data: ReturnType<typeof useDashboardData>;
  navigate: (p: string) => void;
}

type RowKind = 'today' | 'tmrw' | 'next';

const KIND_LABEL: Record<RowKind, string> = {
  today: '今日',
  tmrw: '明日',
  next: '后天',
};

export function SchedulePanel({ data, navigate }: Props) {
  const peers = data.colleaguesToday || [];
  const week = data.weekShifts || [];
  const day0 = week[0];
  const day1 = week[1];
  const day2 = week[2];

  const fallbackShop = data.shopName;

  return (
    <div className="space-y-3">
      {/* Main ticket card */}
      <div className="rounded-2xl border border-[hsl(var(--accent)/0.18)] bg-[hsl(35_25%_96%/0.05)] overflow-hidden shadow-lg">
        {/* On-duty staff */}
        <div className="px-4 pt-4 pb-3 border-b border-dashed border-[hsl(var(--accent)/0.25)]">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[10px] tracking-[0.18em] font-semibold text-[hsl(var(--accent))]">今日在岗</span>
            <span className="text-[10px] text-[hsl(var(--primary-foreground)/0.55)]">
              {peers.length > 0 ? `共 ${peers.length + 1} 人在店` : '今日仅你在店'}
            </span>
          </div>
          {peers.length > 0 ? (
            <div className="flex -space-x-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {peers.slice(0, 8).map(c => (
                <div key={c.user_id + c.shift_code} className="relative shrink-0">
                  <Avatar className="w-8 h-8 border-2 border-[hsl(25_16%_13%)]">
                    <AvatarImage src={c.avatar_url || undefined} />
                    <AvatarFallback className="bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--primary-foreground))] text-xs">
                      {(c.display_name || '同')[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[hsl(var(--accent))] text-[8px] font-bold text-[hsl(var(--primary))] border border-[hsl(25_16%_13%)] flex items-center justify-center leading-none">
                    {c.shift_code}
                  </span>
                </div>
              ))}
              {peers.length > 8 && (
                <div className="w-8 h-8 rounded-full border-2 border-[hsl(25_16%_13%)] bg-[hsl(var(--accent)/0.12)] flex items-center justify-center text-[10px] text-[hsl(var(--accent))] font-bold shrink-0">
                  +{peers.length - 8}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[hsl(var(--primary-foreground)/0.4)]">暂无其他同事排班</p>
          )}
        </div>

        {/* 3-day rows */}
        <div className="p-3 space-y-1">
          <DayRow kind="today" day={day0} fallbackShop={fallbackShop} />
          <DayRow kind="tmrw" day={day1} fallbackShop={fallbackShop} />
          <DayRow kind="next" day={day2} fallbackShop={fallbackShop} />
        </div>

        {/* Ticket footer gold strip */}
        <div className="h-1 bg-gradient-to-r from-transparent via-[hsl(var(--accent)/0.35)] to-transparent" />
      </div>

      {/* Week rhythm + CTA */}
      <button
        type="button"
        onClick={() => navigate('/me')}
        className="w-full flex items-center justify-between px-2 py-1 group"
      >
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {week.slice(0, 7).map(d => (
              <span
                key={d.date}
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  d.shift ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary-foreground)/0.18)]'
                )}
              />
            ))}
          </div>
          <span className="text-[10px] tracking-[0.18em] text-[hsl(var(--primary-foreground)/0.5)]">本周节奏</span>
        </div>
        <span className="text-[11px] font-semibold text-[hsl(var(--accent))] flex items-center gap-0.5 group-hover:text-[hsl(var(--primary-foreground))]">
          查看 30 天排班
          <ChevronRight className="w-3 h-3" />
        </span>
      </button>
    </div>
  );
}

/* ----------------------------- row ----------------------------- */

function DayRow({
  kind,
  day,
  fallbackShop,
}: {
  kind: RowKind;
  day: { date: string; shift: any; shopName: string | null } | undefined;
  fallbackShop: string | null;
}) {
  const shift = day?.shift ?? null;
  const isToday = kind === 'today';
  const isRest = !shift;

  const shopName = day?.shopName || fallbackShop || null;

  return (
    <div className={cn(
      'flex items-center gap-3 p-2 rounded-xl',
      isToday && 'bg-[hsl(var(--primary-foreground)/0.04)]'
    )}>
      {/* Date column */}
      <div className="flex flex-col items-center justify-center min-w-[42px] shrink-0">
        <span className="text-[9px] font-bold tracking-tighter text-[hsl(var(--primary-foreground)/0.35)]">
          {day ? weekdayLabel(day.date) : ''}
        </span>
        <span className={cn(
          'text-sm font-bold leading-tight',
          isToday ? 'text-[hsl(var(--accent-soft))]' : 'text-[hsl(var(--primary-foreground)/0.65)]'
        )}>
          {KIND_LABEL[kind]}
        </span>
      </div>

      {/* Divider */}
      <div className="h-9 w-px bg-[hsl(var(--accent)/0.2)] shrink-0" />

      {/* Body */}
      <div className="flex-1 min-w-0">
        {isRest ? (
          <>
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-sm font-semibold',
                isToday ? 'text-[hsl(var(--accent-soft))]' : 'text-[hsl(var(--primary-foreground)/0.6)]'
              )}>
                {isToday ? '今日休息' : '休息'}
              </span>
              {shopName && (
                <span className="text-[10px] text-[hsl(var(--primary-foreground)/0.4)] bg-[hsl(var(--primary-foreground)/0.06)] px-1.5 py-0.5 rounded truncate max-w-[140px]">
                  {shopName}
                </span>
              )}
            </div>
            <p className="text-[10px] text-[hsl(var(--primary-foreground)/0.35)] mt-0.5">好好放松一天</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ShiftBadge code={shift.code} />
              {shopName && (
                <span className="text-[10px] text-[hsl(var(--primary-foreground)/0.45)] bg-[hsl(var(--primary-foreground)/0.06)] px-1.5 py-0.5 rounded truncate max-w-[160px]">
                  {shopName}
                </span>
              )}
            </div>
            <p className={cn(
              'text-sm font-medium mt-0.5 tabular-nums',
              isToday ? 'text-[hsl(var(--accent-soft))]' : 'text-[hsl(var(--primary-foreground)/0.65)]'
            )}>
              {formatShiftTime(shift.start_time, shift.end_time)}
            </p>
          </>
        )}
      </div>

      {/* Right icon */}
      <div className="w-9 h-9 flex items-center justify-center shrink-0">
        {isRest ? (
          <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary-foreground)/0.05)] flex items-center justify-center">
            <Coffee className="w-4 h-4 text-[hsl(var(--primary-foreground)/0.3)]" />
          </div>
        ) : isToday ? (
          <Calendar className="w-4 h-4 text-[hsl(var(--accent))]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[hsl(var(--primary-foreground)/0.25)]" />
        )}
      </div>
    </div>
  );
}

function ShiftBadge({ code }: { code: string }) {
  const u = (code || '').toUpperCase();
  const cls =
    u === 'A' ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))]' :
    u === 'C' ? 'bg-[hsl(var(--destructive)/0.85)] text-[hsl(var(--destructive-foreground))]' :
    /* B & 默认 */ 'border border-[hsl(var(--accent))] text-[hsl(var(--accent))] bg-transparent';
  return (
    <span className={cn(
      'h-5 px-2 inline-flex items-center justify-center rounded text-[10px] font-black tracking-widest',
      cls
    )}>
      {u} 班
    </span>
  );
}

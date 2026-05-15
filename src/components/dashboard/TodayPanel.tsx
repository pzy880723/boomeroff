import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SectionCard } from './primitives/SectionCard';
import { CountUp } from './primitives/CountUp';
import { Sparkline } from './primitives/Sparkline';
import { Flame, Camera, Heart, MessageSquare, ArrowUp, ArrowDown, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { useDashboardData } from '@/hooks/useDashboardData';

interface Props {
  data: ReturnType<typeof useDashboardData>;
}

export function TodayPanel({ data }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const trend = data.stats.prevWeekScans > 0
    ? Math.round(((data.stats.weekScans - data.stats.prevWeekScans) / data.stats.prevWeekScans) * 100)
    : (data.stats.weekScans > 0 ? 100 : 0);

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

  return (
    <div className="space-y-3">
      {/* 打卡 */}
      <SectionCard className="p-3" delay={0}>
        {!data.checkedToday ? (
          <Button
            onClick={handleCheckIn}
            disabled={submitting}
            className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            <Flame className="w-4 h-4 mr-2" />
            {submitting ? '签到中…' : `今日签到 ${data.currentStreak > 0 ? `· 连签 ${data.currentStreak} 天` : ''}`}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 h-11 rounded-xl bg-white/5 text-white/85 text-sm font-medium">
            <Check className="w-4 h-4 text-primary" /> 今日已签到 · 连签 {data.currentStreak} 天
          </div>
        )}
      </SectionCard>

      {/* 三联数据 */}
      <SectionCard className="p-4" delay={60}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] tracking-[0.18em] text-white/50">本周数据</span>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
            trend >= 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
          )}>
            {trend >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {Math.abs(trend)}% 较上周
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat icon={Camera} label="识别" value={data.stats.weekScans} />
          <Stat icon={Heart} label="收藏" value={data.stats.weekFavs} />
          <Stat icon={MessageSquare} label="发布" value={data.stats.weekPosts} />
        </div>
        <Sparkline data={data.stats.weeklySpark} height={40} />
        <div className="flex justify-between text-[10px] text-white/40 mt-1.5">
          <span>7 天前</span>
          <span>今天</span>
        </div>
      </SectionCard>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
      <div className="flex items-center gap-1.5 text-white/50 mb-1">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] tracking-wider">{label}</span>
      </div>
      <CountUp value={value} className="text-2xl font-bold tabular-nums text-white leading-none" />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flame, Check, Calendar as CalIcon, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

interface Props {
  userId: string;
  onChanged?: () => void;
}

function todayShanghai(): string {
  const d = new Date();
  // YYYY-MM-DD in Asia/Shanghai
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d);
}

export function CheckInCard({ userId, onChanged }: Props) {
  const [checkedToday, setCheckedToday] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    const today = todayShanghai();
    const [{ data: today_row }, { data: exp }] = await Promise.all([
      supabase.from('user_check_ins').select('id').eq('user_id', userId).eq('check_in_date', today).maybeSingle(),
      supabase.from('user_experience').select('current_streak').eq('user_id', userId).maybeSingle(),
    ]);
    setCheckedToday(!!today_row);
    setStreak(exp?.current_streak || 0);
    setLoading(false);
  };

  useEffect(() => { if (userId) refresh(); }, [userId]);

  const handleCheckIn = async () => {
    if (checkedToday || submitting) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc('perform_check_in');
    setSubmitting(false);
    if (error) { toast.error('签到失败：' + error.message); return; }
    const result = data as any;
    if (result?.already) {
      toast.info('今天已经签到啦');
    } else {
      const bonus = result?.bonus ? `（连签奖励 +${result.bonus}）` : '';
      toast.success(`签到成功 +${result?.exp_gained} 经验${bonus}`);
    }
    setCheckedToday(true);
    await refresh();
    onChanged?.();
  };

  return (
    <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200/60 dark:border-amber-900/40">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shrink-0">
          {checkedToday ? <Check className="w-6 h-6" /> : <Flame className="w-6 h-6" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{checkedToday ? '今日已打卡' : '每日打卡'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? '加载中…' : (
              <>已连续打卡 <span className="font-semibold text-foreground">{streak}</span> 天</>
            )}
          </p>
        </div>
        <Button
          size="sm"
          disabled={loading || checkedToday || submitting}
          onClick={handleCheckIn}
          className="shrink-0"
        >
          {checkedToday ? '已签到' : (submitting ? '签到中' : '立即打卡')}
        </Button>
      </div>
      <Link to="/me/check-ins" className="mt-3 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors">
        <span className="flex items-center gap-1.5"><CalIcon className="w-3.5 h-3.5" /> 我的打卡记录</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </Card>
  );
}

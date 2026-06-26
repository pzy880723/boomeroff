// 发布历史
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffectiveShop } from '@/hooks/useShops';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { STATUS_COLOR, STATUS_LABEL, type PublishJob } from '@/lib/dispatch';
import { PlatformBadge } from '@/components/marketing/dispatch/PlatformBadge';

export default function HistoryTab() {
  const { shopId } = useEffectiveShop();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<(PublishJob & { _platforms: string[] })[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!shopId) return;
    setLoading(true);
    const { data, error } = await supabase.from('social_publish_jobs')
      .select('*, social_publish_targets(platform)')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) { toast({ title: '加载失败', description: error.message, variant: 'destructive' }); return; }
    const list = (data || []).map((j: any) => ({
      ...j, _platforms: Array.from(new Set((j.social_publish_targets || []).map((t: any) => t.platform))),
    }));
    setJobs(list);
  };

  useEffect(() => { void load(); }, [shopId]);

  // realtime: jobs 变化时刷新
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase.channel(`jobs:${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_publish_jobs', filter: `shop_id=eq.${shopId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [shopId]);

  const cancel = async (jobId: string) => {
    if (!confirm('取消这个定时任务?')) return;
    const { error } = await supabase.functions.invoke('dispatch-job-cancel', { body: { job_id: jobId } });
    if (error) toast({ title: '取消失败', description: error.message, variant: 'destructive' });
    else void load();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">最近 50 条</div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>
      {jobs.length === 0 && !loading && (
        <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed rounded-xl">
          还没有发布过任何内容。
        </div>
      )}
      {jobs.map((j) => (
        <Link
          key={j.id}
          to={`/me/marketing/dispatch/job/${j.id}`}
          className="flex items-center gap-3 p-3 bg-card rounded-xl border hover:border-primary/40 transition-colors"
        >
          {j.cover_url ? (
            <img src={j.cover_url} alt="" className="w-12 h-16 rounded-md object-cover" />
          ) : (
            <div className="w-12 h-16 rounded-md bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
              {j.kind === 'video' ? '视频' : '图文'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{j.title || '(无标题)'}</div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {j._platforms.map((p) => <PlatformBadge key={p} platform={p} size="xs" />)}
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[j.status] || ''}`}>
                {STATUS_LABEL[j.status] || j.status}
              </span>
              {j.schedule_at && (
                <span className="text-[10px] text-muted-foreground">· {new Date(j.schedule_at).toLocaleString('zh-CN')}</span>
              )}
            </div>
          </div>
          {j.status === 'scheduled' && (
            <button onClick={(e) => { e.preventDefault(); void cancel(j.id); }} className="text-muted-foreground hover:text-rose-600 p-1">
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

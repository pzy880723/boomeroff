// 后台跨活动总览：所有待审申请
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { invokeFn } from '@/lib/invokeFn';

export function ActivityReviewPanel() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('list_pending_activity_applications');
    setList((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (id: string, decision: 'approve' | 'reject') => {
    setProcessing(id);
    const { data, error } = await invokeFn('activity-review', {
      body: { application_id: id, decision },
    });
    setProcessing(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || '操作失败');
      return;
    }
    if (decision === 'approve' && (data as any).sms_error) {
      toast.warning('已通过，短信失败：' + (data as any).sms_error);
    } else {
      toast.success(decision === 'approve' ? '已通过' : '已拒绝');
    }
    load();
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">待审申请（{list.length}）</h2>
      {list.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">暂无待审申请</Card>
      ) : list.map((app) => (
        <Card key={app.id} className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{app.applicant_name}</span>
            <span className="text-xs text-muted-foreground">{app.applicant_phone}</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">待审</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>来自活动：</span>
            <Link to={`/me/activities/${app.activity?.id}`} className="text-primary hover:underline flex items-center gap-0.5">
              {app.activity?.name} <ExternalLink className="w-3 h-3" />
            </Link>
            <span className="ml-auto">{format(new Date(app.created_at), 'MM-dd HH:mm')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={processing === app.id} onClick={() => review(app.id, 'reject')}>
              <XCircle className="w-3.5 h-3.5 mr-1" />拒绝
            </Button>
            <Button size="sm" disabled={processing === app.id} onClick={() => review(app.id, 'approve')}>
              {processing === app.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              通过
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

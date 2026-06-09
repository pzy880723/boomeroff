// 活动详情：申请列表 + 审核
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, XCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  type Activity, type ActivityApplication, APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_VARIANT, buildActivityShareUrl,
} from '@/lib/voucher';

export default function ActivityDetail() {
  const { id = '' } = useParams();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [apps, setApps] = useState<ActivityApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: a }, { data: ap }] = await Promise.all([
      supabase.from('activities').select('*').eq('id', id).maybeSingle(),
      supabase.from('activity_applications').select('*').eq('activity_id', id).order('created_at', { ascending: false }),
    ]);
    setActivity((a as any) || null);
    setApps((ap || []) as unknown as ActivityApplication[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const review = async (appId: string, decision: 'approve' | 'reject') => {
    setProcessing(appId);
    const { data, error } = await supabase.functions.invoke('activity-review', {
      body: { application_id: appId, decision },
    });
    setProcessing(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || '操作失败');
      return;
    }
    if (decision === 'approve' && (data as any).sms_error) {
      toast.warning('已通过，但短信发送失败：' + (data as any).sms_error);
    } else {
      toast.success(decision === 'approve' ? '已通过并发送通知' : '已拒绝');
    }
    load();
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!activity) {
    return (
      <>
        <PageHeader title="活动详情" back="/me/activities" />
        <div className="container max-w-screen-md mx-auto px-3 py-6">
          <Card className="p-6 text-center text-sm text-muted-foreground">活动不存在</Card>
        </div>
      </>
    );
  }

  const filtered = (status: string) => apps.filter((a) => a.status === status);

  return (
    <>
      <PageHeader title={activity.name} back="/me/activities" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <Card className="p-3 space-y-2">
          {activity.description && <p className="text-xs text-muted-foreground">{activity.description}</p>}
          <Button
            size="sm" variant="outline" className="w-full"
            onClick={async () => {
              const url = buildActivityShareUrl(activity.share_token);
              try { await navigator.clipboard.writeText(url); toast.success('链接已复制'); }
              catch { toast.success(url); }
            }}
          >
            <Copy className="w-3.5 h-3.5 mr-1" />复制活动链接
          </Button>
        </Card>

        <Tabs defaultValue="pending">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="pending">待审 ({filtered('pending').length})</TabsTrigger>
            <TabsTrigger value="approved">通过 ({filtered('approved').length})</TabsTrigger>
            <TabsTrigger value="rejected">拒绝 ({filtered('rejected').length})</TabsTrigger>
          </TabsList>

          {(['pending', 'approved', 'rejected'] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="space-y-2 mt-2">
              {filtered(tab).length === 0 ? (
                <Card className="p-6 text-center text-xs text-muted-foreground">暂无</Card>
              ) : filtered(tab).map((app) => (
                <Card key={app.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{app.applicant_name}</span>
                    <span className="text-xs text-muted-foreground">{app.applicant_phone}</span>
                    <Badge variant={APPLICATION_STATUS_VARIANT[app.status]} className="ml-auto text-[10px]">
                      {APPLICATION_STATUS_LABEL[app.status]}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{format(new Date(app.created_at), 'yyyy-MM-dd HH:mm')}</p>
                  {activity.form_fields.length > 0 && (
                    <div className="text-xs space-y-1 border-t pt-2">
                      {activity.form_fields.map((f) => {
                        const v = app.form_data?.[f.key];
                        if (v === null || v === undefined || v === '') return null;
                        return (
                          <div key={f.key} className="flex gap-2">
                            <span className="text-muted-foreground shrink-0">{f.label}:</span>
                            {f.type === 'image' && typeof v === 'string' ? (
                              <a
                                href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/sign/voucher-screenshots/${v}`}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  const { data } = await supabase.storage
                                    .from('voucher-screenshots')
                                    .createSignedUrl(String(v), 600);
                                  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                                }}
                                className="text-primary underline truncate"
                              >查看截图</a>
                            ) : f.type === 'url' && typeof v === 'string' ? (
                              <a href={String(v)} target="_blank" rel="noreferrer" className="text-primary underline truncate">{String(v)}</a>
                            ) : (
                              <span className="break-all">{String(v)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {app.status === 'pending' && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button size="sm" variant="outline" disabled={processing === app.id} onClick={() => review(app.id, 'reject')}>
                        <XCircle className="w-3.5 h-3.5 mr-1" />拒绝
                      </Button>
                      <Button size="sm" disabled={processing === app.id} onClick={() => review(app.id, 'approve')}>
                        {processing === app.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                        通过
                      </Button>
                    </div>
                  )}
                  {app.status === 'approved' && app.sms_error && (
                    <p className="text-[11px] text-destructive">短信失败：{app.sms_error}</p>
                  )}
                  {app.status === 'approved' && app.sms_sent_at && (
                    <p className="text-[11px] text-muted-foreground">短信已发送 · {format(new Date(app.sms_sent_at), 'MM-dd HH:mm')}</p>
                  )}
                </Card>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}

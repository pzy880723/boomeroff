// 活动详情：信息卡 + 统计 + 申请/领取列表 + 底部操作（修改/删除）
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, XCircle, Share2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  type Activity, type ActivityApplication, APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_VARIANT, buildActivityShareUrl, CLAIM_STATUS_LABEL,
} from '@/lib/voucher';
import { ActivityEditDialog } from '@/components/voucher/ActivityEditDialog';
import { ActivityShareDialog } from '@/components/voucher/ActivityShareDialog';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type AppWithClaim = ActivityApplication & {
  voucher_claim?: { status: string; short_code: string | null; redeemed_at: string | null } | null;
};

export default function ActivityDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [apps, setApps] = useState<AppWithClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: a }, { data: ap }] = await Promise.all([
      supabase.from('activities').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('activity_applications')
        .select('*, voucher_claim:voucher_claims(status, short_code, redeemed_at)')
        .eq('activity_id', id)
        .order('created_at', { ascending: false }),
    ]);
    setActivity((a as any) || null);
    setApps((ap || []) as unknown as AppWithClaim[]);
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

  const handleDelete = async () => {
    if (!activity) return;
    const { error } = await supabase.from('activities').delete().eq('id', activity.id);
    if (error) { toast.error(error.message); return; }
    toast.success('已删除');
    navigate('/me/activities', { replace: true });
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

  const counts = {
    total: apps.length,
    approved: apps.filter((a) => a.status === 'approved').length,
    rejected: apps.filter((a) => a.status === 'rejected').length,
    pending: apps.filter((a) => a.status === 'pending').length,
    redeemed: apps.filter((a) => a.voucher_claim?.status === 'redeemed').length,
  };

  const filtered = (status: string) => apps.filter((a) => a.status === status);

  const timeRange = activity.starts_at || activity.ends_at
    ? `${activity.starts_at ? format(new Date(activity.starts_at), 'yyyy-MM-dd') : '不限'} ~ ${activity.ends_at ? format(new Date(activity.ends_at), 'yyyy-MM-dd') : '不限'}`
    : '长期有效';

  const claimStatusLabel = (app: AppWithClaim) => {
    const s = app.voucher_claim?.status;
    if (!s) return '已领取';
    return CLAIM_STATUS_LABEL[s] || s;
  };
  const claimStatusVariant = (app: AppWithClaim): 'default' | 'secondary' | 'destructive' | 'outline' => {
    const s = app.voucher_claim?.status;
    if (s === 'redeemed') return 'secondary';
    if (s === 'expired' || s === 'void') return 'destructive';
    return 'default';
  };

  const statusLabel = activity.status === 'active' ? '进行中' : activity.status === 'draft' ? '草稿' : '已关闭';
  const statusDot = activity.status === 'active' ? 'bg-emerald-500' : activity.status === 'draft' ? 'bg-muted-foreground' : 'bg-destructive';

  const shareUrl = buildActivityShareUrl(activity.share_token);
  const sharePath = (() => {
    try { return new URL(shareUrl).pathname; } catch { return shareUrl; }
  })();


  const MetaRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground shrink-0 w-16">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-right">{children}</div>
    </div>
  );

  return (
    <>
      <PageHeader title={activity.name} back="/me/activities" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3 pb-8">
        {/* 信息卡 */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDot} ${activity.status === 'active' ? 'animate-pulse' : ''}`} />
              {statusLabel}
            </span>
            <Badge variant="outline" className="text-[10px] font-normal">
              {activity.requires_review ? '需审核' : '免审核'}
            </Badge>
          </div>

          <div>
            <h2 className="text-xl font-semibold leading-tight tracking-tight">{activity.name}</h2>
            {activity.description && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">{activity.description}</p>
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            <MetaRow label="活动时间">
              <span className="truncate">{timeRange}</span>
            </MetaRow>
            <MetaRow label="创建时间">
              <span className="truncate">{format(new Date(activity.created_at), 'yyyy-MM-dd HH:mm')}</span>
            </MetaRow>
            <MetaRow label="分享">
              <span className="truncate text-muted-foreground">{sharePath}</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 -mr-2 shrink-0" onClick={() => setShareOpen(true)}>
                <Share2 className="w-3.5 h-3.5 mr-1" /> 海报
              </Button>
            </MetaRow>
          </div>
        </Card>

        {/* 统计卡 */}
        <Card className="p-0 overflow-hidden">
          {activity.requires_review ? (
            <div className="grid grid-cols-3 divide-x">
              <div className="px-2 py-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">已申请</p>
              </div>
              <div className="px-2 py-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{counts.approved}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">已通过</p>
              </div>
              <div className="px-2 py-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{counts.rejected}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">已拒绝</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x">
              <div className="px-2 py-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{counts.total}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">已领取</p>
              </div>
              <div className="px-2 py-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{counts.redeemed}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">已核销</p>
              </div>
            </div>
          )}
        </Card>

        {/* 列表 */}
        {activity.requires_review ? (
          <Tabs defaultValue="pending">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="pending">待审 ({counts.pending})</TabsTrigger>
              <TabsTrigger value="approved">通过 ({counts.approved})</TabsTrigger>
              <TabsTrigger value="rejected">拒绝 ({counts.rejected})</TabsTrigger>
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
                                  href="#"
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
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium px-1 text-muted-foreground">领取列表（{apps.length}）</p>
            {apps.length === 0 ? (
              <Card className="p-6 text-center text-xs text-muted-foreground">还没有人领取</Card>
            ) : apps.map((app) => (
              <Card key={app.id} className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{app.applicant_name}</span>
                  <span className="text-xs text-muted-foreground">{app.applicant_phone}</span>
                  <Badge variant={claimStatusVariant(app)} className="ml-auto text-[10px]">
                    {claimStatusLabel(app)}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  领取：{format(new Date(app.created_at), 'yyyy-MM-dd HH:mm')}
                  {app.voucher_claim?.redeemed_at && (
                    <> · 核销：{format(new Date(app.voucher_claim.redeemed_at), 'yyyy-MM-dd HH:mm')}</>
                  )}
                </p>
              </Card>
            ))}
          </div>
        )}

        {/* 底部操作 */}
        <div className="pt-4 space-y-2">
          <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-1.5" /> 修改活动
          </Button>
          <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/5" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4 mr-1.5" /> 删除活动
          </Button>
        </div>
      </div>

      {user && (
        <ActivityEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          userId={user.id}
          activityId={activity.id}
          onSaved={() => load()}
        />
      )}

      <ActivityShareDialog open={shareOpen} onOpenChange={setShareOpen} activity={activity} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该活动所有申请记录都将一并清除，已发放的抵用券仍然有效。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

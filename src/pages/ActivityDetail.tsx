// 活动详情：信息卡 + 统计 + 申请/领取列表 + 底部操作（修改/删除）
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Share2, Pencil, Trash2, RefreshCw, Search, CheckCircle2, CircleDashed, Copy, Ticket, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  type Activity, type ActivityApplication, CLAIM_STATUS_LABEL, getActivityTimeInfo, buildClaimShareUrl,
} from '@/lib/voucher';

import { ActivityEditDialog } from '@/components/voucher/ActivityEditDialog';
import { ActivityShareDialog } from '@/components/voucher/ActivityShareDialog';
import { PublishConfirmDialog } from '@/components/voucher/PublishConfirmDialog';
import { ImageLightbox } from '@/components/voucher/ImageLightbox';
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
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmApp, setConfirmApp] = useState<AppWithClaim | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [signedUrlMap, setSignedUrlMap] = useState<Record<string, string>>({});

  const openImage = async (path: string) => {
    const cached = signedUrlMap[path];
    if (cached) {
      setLightbox({ images: [cached], index: 0 });
      return;
    }
    // 兜底:缓存未命中(预签后新增的申请),立即打开 Lightbox 并显示 loading,后台签名
    setLightbox({ images: [''], index: 0 });
    const { data } = await supabase.storage
      .from('voucher-screenshots')
      .createSignedUrl(path, 3600, { transform: { width: 1080, quality: 80 } } as any);
    if (data?.signedUrl) {
      setSignedUrlMap((m) => ({ ...m, [path]: data.signedUrl }));
      setLightbox({ images: [data.signedUrl], index: 0 });
    } else {
      setLightbox(null);
      toast.error('截图加载失败');
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [{ data: a }, { data: ap }] = await Promise.all([
      supabase.from('activities').select('*').eq('id', id).maybeSingle(),
      supabase.rpc('list_activity_applications', { _activity_id: id as string }),
    ]);
    setActivity((a as any) || null);
    const list = ((ap || []) as unknown as AppWithClaim[]);
    setApps(list);
    if (!silent) setLoading(false);

    // 批量预签所有截图(image 类型字段),后续点击 0 延迟打开
    try {
      const fields = ((a as any)?.form_fields || []) as Array<{ key: string; type: string }>;
      const imageKeys = fields.filter((f) => f.type === 'image').map((f) => f.key);
      if (imageKeys.length === 0) return;
      const paths = Array.from(new Set(
        list.flatMap((app) => imageKeys
          .map((k) => app.form_data?.[k])
          .filter((v): v is string => typeof v === 'string' && v.length > 0)),
      ));
      const missing = paths.filter((p) => !signedUrlMap[p]);
      if (missing.length === 0) return;
      const { data: signed } = await supabase.storage
        .from('voucher-screenshots')
        .createSignedUrls(missing, 3600, { transform: { width: 1080, quality: 80 } } as any);
      if (!signed) return;
      setSignedUrlMap((m) => {
        const next = { ...m };
        for (const s of signed) {
          if (s.signedUrl && s.path) next[s.path] = s.signedUrl;
        }
        return next;
      });
    } catch { /* 预签失败不影响主流程,点击时会兜底 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // 轮询同步：申请表和优惠券领取表含手机号等隐私字段，不通过 Realtime 广播；
  // 改为页面可见时每 15 秒静默刷新一次。
  useEffect(() => {
    if (!id) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') load(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [id, load]);




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
    redeemed: apps.filter((a) => a.voucher_claim?.status === 'redeemed').length,
  };


  const fmtDt = (s: string) => format(new Date(s), 'yyyy-MM-dd HH:mm');
  const timeRange = activity.starts_at || activity.ends_at
    ? `${activity.starts_at ? fmtDt(activity.starts_at) : '不限'} ~ ${activity.ends_at ? fmtDt(activity.ends_at) : '不限'}`
    : '长期有效';
  const collectFields = ['姓名', '电话', ...(activity.form_fields || []).map((f) => f.label)].join(' / ');

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

  const timeInfo = getActivityTimeInfo(activity);

  const hasPoster = !!activity.poster_url;

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
              <Badge variant={timeInfo.badgeVariant} className="text-[10px] h-4 px-1.5">
                {timeInfo.label}
              </Badge>
              {timeInfo.countdown && (
                <span className="text-[10px] text-amber-500">{timeInfo.countdown}</span>
              )}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-semibold leading-tight tracking-tight">{activity.name}</h2>
            {activity.description && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{activity.description}</p>
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            <MetaRow label="活动时间">
              <span className="truncate">{timeRange}</span>
            </MetaRow>
            <MetaRow label="收集字段">
              <span className="truncate" title={collectFields}>{collectFields}</span>
            </MetaRow>
            <MetaRow label="创建时间">
              <span className="truncate">{format(new Date(activity.created_at), 'yyyy-MM-dd HH:mm')}</span>
            </MetaRow>
          </div>

          {hasPoster ? (
            <div className="flex gap-2 mt-1">
              <Button onClick={() => setShareOpen(true)} className="flex-1 h-10">
                <Share2 className="w-4 h-4 mr-1.5" /> 打开转发海报
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-10"
                onClick={async () => {
                  if (!activity) return;
                  const { error } = await supabase
                    .from('activities')
                    .update({ poster_url: null })
                    .eq('id', activity.id);
                  if (error) {
                    toast.error('清除海报缓存失败：' + error.message);
                    return;
                  }
                  setActivity((a) => (a ? { ...a, poster_url: null } : a));
                  setShareOpen(true);
                }}
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> 重新生成海报
              </Button>
            </div>
          ) : (
            <Button onClick={() => setShareOpen(true)} className="w-full h-10 mt-1">
              <Share2 className="w-4 h-4 mr-1.5" />
              生成分享海报
            </Button>
          )}
        </Card>


        {/* 统计卡：与绑定优惠券一致 */}
        <Card className="p-0 overflow-hidden">
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
          <div className="px-3 pb-2 text-[10px] text-muted-foreground/80 text-center">
            数值与绑定的优惠券实时一致
          </div>
        </Card>

        {/* 领取列表 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <p className="text-xs font-medium text-muted-foreground shrink-0">
              领取列表（{apps.length}）
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 ml-auto"
              onClick={() => load()}
              title="刷新"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名 / 电话 / 账号名称"
              className="pl-8 h-9 text-xs"
            />
          </div>
          {(() => {
            const kw = search.trim().toLowerCase();
            const filtered = !kw ? apps : apps.filter((a) => {
              if (a.applicant_name?.toLowerCase().includes(kw)) return true;
              if (a.applicant_phone?.toLowerCase().includes(kw)) return true;
              const fd = a.form_data || {};
              return Object.values(fd).some((v) =>
                typeof v === 'string' && v.toLowerCase().includes(kw)
              );
            });
            if (filtered.length === 0) {
              return <Card className="p-6 text-center text-xs text-muted-foreground">
                {apps.length === 0 ? '还没有人领取' : '没有匹配的记录'}
              </Card>;
            }
            return filtered.map((app) => (
              <Card key={app.id} className="p-3 space-y-2">
                {/* 顶部 meta:姓名 + 电话 + 发布状态 + 核销状态 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{app.applicant_name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{app.applicant_phone}</span>
                  {app.publish_confirmed ? (
                    <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                      <CheckCircle2 className="w-3 h-3 mr-0.5" />已发布
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      <CircleDashed className="w-3 h-3 mr-0.5" />待确认
                    </Badge>
                  )}
                  <Badge variant={claimStatusVariant(app)} className="ml-auto text-[10px]">
                    {claimStatusLabel(app)}
                  </Badge>
                </div>

                {/* 表单字段:上下结构,每行整宽 */}
                {activity.form_fields.length > 0 && (() => {
                  const rows = activity.form_fields
                    .map((f) => {
                      const v = app.form_data?.[f.key];
                      if (v === null || v === undefined || v === '') return null;
                      return { f, v };
                    })
                    .filter(Boolean) as Array<{ f: typeof activity.form_fields[number]; v: any }>;
                  if (rows.length === 0) return null;
                  return (
                    <div className="border-t pt-2 grid grid-cols-1 gap-2">
                      {rows.map(({ f, v }) => (
                        <div key={f.key} className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-muted-foreground">{f.label}</span>
                          {f.type === 'image' && typeof v === 'string' ? (
                            <button
                              type="button"
                              onClick={() => openImage(String(v))}
                              className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/40 text-primary text-[11px] hover:bg-primary/5"
                            >
                              <ImageIcon className="w-3 h-3" />查看截图
                            </button>
                          ) : f.type === 'url' && typeof v === 'string' ? (
                            <a
                              href={String(v)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline break-all"
                            >{String(v)}</a>
                          ) : (
                            <span className="text-xs break-all">{String(v)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 时间行 */}
                <p className="text-[11px] text-muted-foreground border-t pt-2">
                  领取 {fmtDt(app.created_at)}
                  {app.voucher_claim?.redeemed_at && (
                    <> · 核销 {fmtDt(app.voucher_claim.redeemed_at)}</>
                  )}
                </p>

                {/* 操作按钮:左对齐 + flex-wrap,窄屏自然换行 */}
                <div className="flex flex-wrap gap-1.5">
                  {app.publish_url && (
                    <a
                      href={app.publish_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-primary underline inline-flex items-center gap-0.5 max-w-[10rem] truncate h-7 px-2"
                      title={app.publish_url}
                    >
                      🔗 发布链接
                    </a>
                  )}
                  {app.status === 'approved' && app.voucher_claim?.short_code && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(buildClaimShareUrl(app.voucher_claim!.short_code!));
                            toast.success('领取链接已复制');
                          } catch {
                            toast.error('复制失败，请手动复制');
                          }
                        }}
                      >
                        <Copy className="w-3 h-3 mr-0.5" />复制券链接
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2"
                        onClick={() => navigate(`/me/vouchers/share/${app.voucher_claim_id}`)}
                      >
                        <Ticket className="w-3 h-3 mr-0.5" />查看券
                      </Button>
                    </>
                  )}
                  {app.status === 'approved' && !app.voucher_claim_id && (
                    <Badge variant="destructive" className="text-[10px]">券缺失·请联系管理员</Badge>
                  )}
                  <Button
                    size="sm"
                    variant={app.publish_confirmed ? 'secondary' : 'outline'}
                    className="h-7 text-[11px] px-2 ml-auto"
                    onClick={() => setConfirmApp(app)}
                  >
                    {app.publish_confirmed ? '查看发布' : '发布确认'}
                  </Button>
                </div>
              </Card>
            ));
          })()}
        </div>



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

      <ActivityShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        activity={activity}
        onPosterSaved={(url) => setActivity((a) => a ? { ...a, poster_url: url } : a)}
      />

      <PublishConfirmDialog
        open={!!confirmApp}
        onOpenChange={(v) => { if (!v) setConfirmApp(null); }}
        app={confirmApp}
        fields={activity.form_fields || []}
        onSaved={() => load(true)}
      />

      <ImageLightbox
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        images={lightbox?.images || []}
        initialIndex={lightbox?.index || 0}
      />






      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该活动所有申请记录都将一并清除，已发放的优惠券仍然有效。此操作不可恢复。
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

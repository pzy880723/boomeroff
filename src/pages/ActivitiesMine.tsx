// 我的活动：列表 + 新建/编辑/删除
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Megaphone, Share2, MoreVertical, Pencil, Trash2, CalendarRange, ChevronRight } from 'lucide-react';
import { ActivityEditDialog } from '@/components/voucher/ActivityEditDialog';
import { ActivityShareDialog } from '@/components/voucher/ActivityShareDialog';
import { type Activity, getActivityTimeInfo } from '@/lib/voucher';
import { AuthPage } from '@/components/auth/AuthPage';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_LABEL: Record<string, string> = { draft: '草稿', active: '进行中', closed: '已关闭' };

export default function ActivitiesMine() {
  const { user, loading: authLoading } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [list, setList] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareActivity, setShareActivity] = useState<Activity | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('activities').select('*').order('created_at', { ascending: false });
    setList((data || []) as unknown as Activity[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from('activities').delete().eq('id', deletingId);
    if (error) { toast.error(error.message); return; }
    toast.success('已删除');
    setDeletingId(null);
    load();
  };

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!user) return <AuthPage />;
  if (!can('voucher.manage')) {
    return (
      <>
        <PageHeader title="我的活动" back="/me" />
        <div className="container max-w-screen-md mx-auto px-3 py-6">
          <Card className="p-6 text-center text-sm text-muted-foreground">当前账号没有活动管理权限</Card>
        </div>
      </>
    );
  }

  const fmtRange = (s?: string | null, e?: string | null) => {
    if (!s && !e) return '长期有效';
    const fmt = (d: string) => format(new Date(d), 'MM-dd HH:mm');
    if (s && e) return `${fmt(s)} → ${fmt(e)}`;
    if (s) return `${fmt(s)} 起`;
    return `截止 ${fmt(e!)}`;
  };

  return (
    <>
      <PageHeader title="我的活动" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 pb-24 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
              <Megaphone className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <p className="text-sm text-muted-foreground">暂无活动</p>
            <p className="text-xs text-muted-foreground/70 mt-1">点击底部按钮创建你的第一个活动</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {list.map((a) => {
              const statusTone =
                a.status === 'active' ? 'bg-emerald-500'
                : a.status === 'closed' ? 'bg-muted-foreground/40'
                : 'bg-amber-500';
              return (
                <Card
                  key={a.id}
                  className="group overflow-hidden border-border/60 hover:border-primary/40 hover:shadow-md transition-all"
                >
                  <div className="flex">
                    {a.cover_url ? (
                      <button
                        onClick={() => navigate(`/me/activities/${a.id}`)}
                        className="relative w-20 shrink-0 bg-muted"
                        aria-label={a.name}
                      >
                        <img src={a.cover_url} alt={a.name} className="absolute inset-0 w-full h-full object-cover" />
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/me/activities/${a.id}`)}
                        className="w-20 shrink-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center"
                        aria-label={a.name}
                      >
                        <Megaphone className="w-7 h-7 text-primary/60" />
                      </button>
                    )}
                    <div className="flex-1 min-w-0 p-3">
                      <button onClick={() => navigate(`/me/activities/${a.id}`)} className="w-full text-left">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusTone}`} />
                          <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[a.status]}</span>
                        </div>
                        <div className="font-medium text-sm mt-0.5 truncate">{a.name}</div>
                        {a.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.description}</p>
                        )}
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 mt-1.5">
                          <CalendarRange className="w-3 h-3" />
                          <span className="truncate">{fmtRange(a.starts_at, a.ends_at)}</span>
                        </div>
                      </button>
                    </div>
                    <div className="flex flex-col items-center justify-between p-1.5 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setShareActivity(a)}>
                            <Share2 className="w-3.5 h-3.5 mr-2" />分享海报
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditId(a.id); setEditOpen(true); }}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />编辑
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(a.id)}>
                            <Trash2 className="w-3.5 h-3.5 mr-2" />删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 mr-1 mb-1" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部新建按钮 */}
      <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none">
        <div className="container mx-auto max-w-screen-md px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-auto">
          <Button
            onClick={() => { setEditId(null); setEditOpen(true); }}
            className="w-full h-12 shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4 mr-1.5" /> 新建活动
          </Button>
        </div>
      </div>


      <ActivityEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        userId={user.id}
        activityId={editId}
        onSaved={() => load()}
      />

      <ActivityShareDialog
        open={!!shareActivity}
        onOpenChange={(o) => !o && setShareActivity(null)}
        activity={shareActivity}
        onPosterSaved={(url) => {
          if (!shareActivity) return;
          const id = shareActivity.id;
          setList((prev) => prev.map((a) => a.id === id ? { ...a, poster_url: url } : a));
          setShareActivity((a) => a ? { ...a, poster_url: url } : a);
        }}
      />


      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
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

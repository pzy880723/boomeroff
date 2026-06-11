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
import { Loader2, Plus, Megaphone, Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { ActivityEditDialog } from '@/components/voucher/ActivityEditDialog';
import { type Activity, buildActivityShareUrl } from '@/lib/voucher';
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

  return (
    <>
      <PageHeader title="我的活动" back="/me" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-3">
        <Button onClick={() => { setEditId(null); setEditOpen(true); }} className="w-full h-12">
          <Plus className="w-4 h-4 mr-1.5" /> 新建活动
        </Button>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-50" />
            还没创建过活动
          </Card>
        ) : (
          <div className="space-y-2">
            {list.map((a) => (
              <Card key={a.id} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <button onClick={() => navigate(`/me/activities/${a.id}`)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium text-sm flex-1 truncate">{a.name}</span>
                      <Badge variant={a.status === 'active' ? 'default' : 'outline'} className="text-[10px]">{STATUS_LABEL[a.status]}</Badge>
                      <Badge variant="outline" className="text-[10px]">{a.requires_review ? '需审核' : '免审核'}</Badge>
                    </div>
                    {a.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(a.created_at), 'yyyy-MM-dd HH:mm')}</p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditId(a.id); setEditOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5 mr-2" />编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(a.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" />删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Button
                  size="sm" variant="outline" className="w-full h-8"
                  onClick={async () => {
                    const url = buildActivityShareUrl(a.share_token);
                    try { await navigator.clipboard.writeText(url); toast.success('活动链接已复制'); }
                    catch { toast.success(url); }
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" /> 复制活动链接
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ActivityEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        userId={user.id}
        activityId={editId}
        onSaved={() => load()}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
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

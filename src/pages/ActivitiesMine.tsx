// 我的活动：列表 + 新建入口
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Megaphone, Copy } from 'lucide-react';
import { ActivityEditDialog } from '@/components/voucher/ActivityEditDialog';
import { type Activity, buildActivityShareUrl } from '@/lib/voucher';
import { AuthPage } from '@/components/auth/AuthPage';
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

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('activities').select('*').order('created_at', { ascending: false });
    setList((data || []) as unknown as Activity[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

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
        <Button onClick={() => setEditOpen(true)} className="w-full h-12">
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
                <button onClick={() => navigate(`/me/activities/${a.id}`)} className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-sm flex-1 truncate">{a.name}</span>
                    <Badge variant={a.status === 'active' ? 'default' : 'outline'} className="text-[10px]">{STATUS_LABEL[a.status]}</Badge>
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(a.created_at), 'yyyy-MM-dd HH:mm')}</p>
                </button>
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

      <ActivityEditDialog open={editOpen} onOpenChange={setEditOpen} userId={user.id} onSaved={() => load()} />
    </>
  );
}

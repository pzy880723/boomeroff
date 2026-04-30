import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Camera, Star, Image, History as HistoryIcon, Lock, LogOut, ChevronRight, Edit2 } from 'lucide-react';
import logo from '@/assets/boomer-off-vintage-logo.png';
import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@/types';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function Me() {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState({ scans: 0, favs: 0, posts: 0 });
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: profile }, scansC, favsC, postsC] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
        supabase.from('user_favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      setDisplayName(profile?.display_name || user.email?.split('@')[0] || '中古玩家');
      setStats({ scans: scansC.count || 0, favs: favsC.count || 0, posts: postsC.count || 0 });
      setLoading(false);
    })();
  }, [user]);

  const saveName = async () => {
    if (!user || !draftName.trim()) return;
    const { error } = await supabase.from('profiles').update({ display_name: draftName.trim() }).eq('user_id', user.id);
    if (error) { toast.error('保存失败'); return; }
    setDisplayName(draftName.trim());
    setEditOpen(false);
    toast.success('已保存');
  };

  const requestPasswordReset = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error('发送失败');
    else toast.success('重置邮件已发送，请查收');
  };

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  return (
    <>
      <PageHeader title="我的" />
      <div className="container mx-auto max-w-screen-md px-3 py-3 space-y-4">
        {/* Profile card */}
        <Card className="p-4 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-gradient-primary text-primary-foreground text-lg">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold truncate">{displayName}</h2>
              <button onClick={() => { setDraftName(displayName); setEditOpen(true); }}>
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            {role && <Badge variant="secondary" className="mt-1.5 text-[10px]">{ROLE_LABELS[role]}</Badge>}
          </div>
        </Card>

        {/* Growth */}
        <Card className="p-4 bg-gradient-primary text-primary-foreground">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Lv.1 中古萌新</span>
            <span className="text-xs opacity-80">距下一级 还需识别 10 次</span>
          </div>
          <div className="h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden">
            <div className="h-full bg-primary-foreground/80" style={{ width: `${Math.min((stats.scans / 10) * 100, 100)}%` }} />
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <Camera className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-lg font-semibold tabular-nums">{loading ? '…' : stats.scans}</p>
            <p className="text-[11px] text-muted-foreground">识图次数</p>
          </Card>
          <Card className="p-3 text-center">
            <Star className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
            <p className="text-lg font-semibold tabular-nums">{loading ? '…' : stats.favs}</p>
            <p className="text-[11px] text-muted-foreground">收藏数</p>
          </Card>
          <Card className="p-3 text-center">
            <Image className="w-5 h-5 mx-auto mb-1 text-accent" />
            <p className="text-lg font-semibold tabular-nums">{loading ? '…' : stats.posts}</p>
            <p className="text-[11px] text-muted-foreground">发布动态</p>
          </Card>
        </div>

        {/* Settings */}
        <Card className="overflow-hidden">
          <Link to="/history" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors">
            <HistoryIcon className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">历史记录</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <button onClick={requestPasswordReset} className="w-full flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
            <Lock className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm text-left">修改密码</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={signOut} className="w-full flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
            <LogOut className="w-5 h-5 text-destructive" />
            <span className="flex-1 text-sm text-left text-destructive">退出登录</span>
          </button>
        </Card>

        <div className="flex flex-col items-center gap-2 pt-6 pb-4 opacity-70">
          <img src={logo} alt="BOOMER-OFF" className="h-14 w-14 rounded-lg object-contain" draggable={false} />
          <p className="text-xs text-muted-foreground">BOOMER-OFF · v0.1.0</p>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>编辑昵称</DialogTitle></DialogHeader>
          <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={30} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={saveName}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

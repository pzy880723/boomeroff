import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Camera, Star, Image, History as HistoryIcon, Lock, LogOut,
  ChevronRight, Edit2, CalendarCheck, BookOpen, MessagesSquare, MapPin, Briefcase, Ticket, Megaphone, Clapperboard,
} from 'lucide-react';
import logo from '@/assets/boomer-off-vintage-logo.png';
import { Link } from 'react-router-dom';
import { ROLE_LABELS, POSITION_LABELS, type StaffPosition } from '@/types';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CheckInCard } from '@/components/me/CheckInCard';
import { LevelCard } from '@/components/me/LevelCard';
import { AvatarPicker } from '@/components/me/AvatarPicker';
import { SchedulePanel } from '@/components/me/SchedulePanel';

export default function Me() {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [realName, setRealName] = useState<string | null>(null);
  const [position, setPosition] = useState<StaffPosition | null>(null);
  const [stats, setStats] = useState({ scans: 0, favs: 0, posts: 0 });
  const [totalExp, setTotalExp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [expRefreshKey, setExpRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: profile }, scansC, favsC, postsC, { data: exp }, { data: sp }] = await Promise.all([
        supabase.from('profiles').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
        supabase.from('user_favorites').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('user_experience').select('total_exp').eq('user_id', user.id).maybeSingle(),
        supabase.from('staff_profiles' as any).select('shop_id, real_name, position').eq('user_id', user.id).maybeSingle(),
      ]);
      setDisplayName(profile?.display_name || user.email?.split('@')[0] || '店员');
      setAvatarUrl((profile as any)?.avatar_url || null);
      setStats({ scans: scansC.count || 0, favs: favsC.count || 0, posts: postsC.count || 0 });
      setTotalExp(exp?.total_exp || 0);
      setRealName((sp as any)?.real_name || null);
      setPosition(((sp as any)?.position as StaffPosition) || null);
      const sid = (sp as any)?.shop_id;
      if (sid) {
        const { data: shop } = await supabase.from('shops' as any).select('name').eq('id', sid).maybeSingle();
        setShopName((shop as any)?.name || null);
      } else {
        setShopName(null);
      }
      setLoading(false);
    })();
  }, [user, expRefreshKey]);

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
        <Card className="p-4 flex items-start gap-4">
          <AvatarPicker
            userId={user.id}
            displayName={displayName}
            avatarUrl={avatarUrl}
            onChanged={setAvatarUrl}
            size={72}
          />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold truncate">{displayName}</h2>
              <button onClick={() => { setDraftName(displayName); setEditOpen(true); }} aria-label="编辑昵称">
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {realName ? <span className="text-foreground/80">{realName} · </span> : null}
              {user.email}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {role && <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[role]}</Badge>}
              {position && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Briefcase className="w-3 h-3" />
                  {POSITION_LABELS[position]}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] gap-1">
                <MapPin className="w-3 h-3" />
                {shopName || '未分配门店'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Marketing Banner (主入口) — 年鉴版·古铜烫金 */}
        <Link to="/me/marketing" className="block group">
          <Card className="relative overflow-hidden p-5 rounded-[0.875rem] bg-card border border-accent/15 shadow-sm hover:border-accent/40 transition-all active:scale-[0.995]">
            {/* hairline frame */}
            <div className="pointer-events-none absolute inset-2 rounded-[0.625rem] border border-accent/10" />
            {/* decorative clapperboard */}
            <div className="absolute -right-5 -bottom-6 opacity-[0.08] pointer-events-none select-none">
              <Clapperboard className="w-28 h-28 text-accent" strokeWidth={1} />
            </div>

            <div className="relative flex items-start gap-4">
              {/* serif numeral mark */}
              <div className="shrink-0 w-14 h-14 rounded-[0.625rem] bg-gradient-to-br from-accent/15 to-accent/5 border border-accent/25 flex flex-col items-center justify-center">
                <span className="font-display text-[10px] text-accent tracking-[0.2em] leading-none">N°</span>
                <span className="font-display text-2xl text-accent leading-none mt-0.5">01</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="h-px w-4 bg-accent/50" />
                  <span className="text-[9px] uppercase tracking-[0.22em] text-accent font-semibold">BOOMER · AI Atelier</span>
                </div>
                <h3 className="font-display text-2xl leading-tight mt-1 text-foreground">营销中心</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5 tracking-wide">一键出图 · 一键出文 · 一键出片</p>

                <div className="mt-2.5 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-accent/90">
                  <span className="flex items-center gap-1"><span className="font-display text-foreground/70 normal-case tracking-normal text-[12px]">修图</span></span>
                  <span className="w-px h-3 bg-accent/30" />
                  <span className="flex items-center gap-1"><span className="font-display text-foreground/70 normal-case tracking-normal text-[12px]">文案</span></span>
                  <span className="w-px h-3 bg-accent/30" />
                  <span className="flex items-center gap-1"><span className="font-display text-foreground/70 normal-case tracking-normal text-[12px]">视频</span></span>
                </div>
              </div>

              <div className="flex flex-col items-end justify-between self-stretch">
                <span className="font-display italic text-[10px] text-accent/70 tracking-wider">Vintage</span>
                <ChevronRight className="w-4 h-4 text-accent/70 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Card>
        </Link>

        {/* Daily check-in */}
        <CheckInCard userId={user.id} onChanged={() => setExpRefreshKey(k => k + 1)} />


        {/* Level */}
        <LevelCard totalExp={totalExp} />

        {/* Schedule */}
        <SchedulePanel />

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
          <Link to="/me/vouchers" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors">
            <Ticket className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">优惠券</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link to="/me/activities" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
            <Megaphone className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">我的活动</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link to="/me/sop" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
            <BookOpen className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">门店手册</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link to="/me/qa" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
            <MessagesSquare className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">顾客 Q&A</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link to="/me/check-ins" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
            <CalendarCheck className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm">我的打卡</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>
          <Link to="/history" className="flex items-center gap-3 p-4 hover:bg-accent/10 transition-colors border-t border-border/60">
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
          <img src={logo} alt="BOOMER-OFF" className="h-24 w-24 rounded-xl object-contain" draggable={false} />
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

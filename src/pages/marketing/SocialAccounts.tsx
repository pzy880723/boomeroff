import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useEffectiveShop } from '@/hooks/useShops';
import { AuthPage } from '@/components/auth/AuthPage';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, RefreshCw, Trash2, ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AddSocialAccountDialog } from '@/components/marketing/AddSocialAccountDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Account {
  id: string;
  shop_id: string;
  platform: 'douyin'|'xhs'|'wechat_video'|'kuaishou';
  account_name: string | null;
  avatar_url: string | null;
  worker_account_key: string;
  worker_account_id: number | null;
  cookie_status: 'active'|'expired'|'invalid'|'pending';
  last_check_at: string | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  douyin: '抖音', xhs: '小红书', wechat_video: '视频号', kuaishou: '快手',
};
const PLATFORM_ORDER: Array<Account['platform']> = ['douyin','xhs','wechat_video','kuaishou'];

export default function SocialAccounts() {
  const { user, loading: authLoading } = useAuth();
  const { shopId, loading: shopLoading } = useEffectiveShop();
  const [list, setList] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const fetchList = useCallback(async (validate = false) => {
    if (!shopId) return;
    if (validate) setValidating(true); else setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('social-account-list', {
        body: { shop_id: shopId, validate },
      });
      if (error) throw error;
      setList((data?.accounts || []) as Account[]);
    } catch (e: any) {
      toast.error('加载账号失败：' + (e?.message || e));
    } finally {
      setLoading(false); setValidating(false);
    }
  }, [shopId]);

  useEffect(() => { if (shopId) void fetchList(false); }, [shopId, fetchList]);

  // Realtime: 任何账号变化都刷新
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase
      .channel(`social_accounts_${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_accounts', filter: `shop_id=eq.${shopId}` },
        () => { void fetchList(false); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [shopId, fetchList]);

  if (authLoading || shopLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!user) return <AuthPage />;

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.functions.invoke('social-account-delete', { body: { account_id: id } });
      if (error) throw error;
      toast.success('已解绑');
      void fetchList(false);
    } catch (e: any) { toast.error('解绑失败：' + (e?.message || e)); }
  }

  const grouped = PLATFORM_ORDER.map(p => ({ platform: p, items: list.filter(x => x.platform === p) }));

  return (
    <>
      <PageHeader title="自媒体账号" back="/me/marketing" subtitle="按门店管理 · 扫码绑定 · 一键发布" />
      <div className="container mx-auto max-w-screen-md px-4 py-4 pb-20 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchList(true)} disabled={validating}>
            {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            校验全部
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> 添加账号
          </Button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : grouped.every(g => g.items.length === 0) ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            还没绑定任何账号<br />
            <span className="text-xs">点右上「添加账号」用手机扫码登录</span>
          </div>
        ) : grouped.map(g => g.items.length > 0 && (
          <section key={g.platform} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground tracking-wider px-1">
              {PLATFORM_LABEL[g.platform]} · {g.items.length}
            </h3>
            <div className="space-y-2">
              {g.items.map(a => <AccountCard key={a.id} a={a} onDelete={handleDelete} />)}
            </div>
          </section>
        ))}

        <p className="text-[10px] text-center text-muted-foreground pt-6">
          通过模拟登录代发布，账号可能触发平台风控，使用风险自负
        </p>
      </div>

      {shopId && (
        <AddSocialAccountDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          shopId={shopId}
          onSuccess={() => void fetchList(false)}
        />
      )}
    </>
  );
}

function AccountCard({ a, onDelete }: { a: Account; onDelete: (id: string) => void }) {
  const statusIcon = a.cookie_status === 'active'
    ? <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
    : a.cookie_status === 'expired'
      ? <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
      : <ShieldOff className="w-3.5 h-3.5 text-destructive" />;
  const statusText = { active: '在线', expired: '已过期', invalid: '已失效', pending: '待激活' }[a.cookie_status];
  const statusClass = { active: 'text-green-700', expired: 'text-amber-700', invalid: 'text-destructive', pending: 'text-muted-foreground' }[a.cookie_status];

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {a.avatar_url ? <img src={a.avatar_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-xs font-semibold text-muted-foreground">{(a.account_name || a.worker_account_key).slice(0, 2)}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{a.account_name || a.worker_account_key}</div>
        <div className={`text-[11px] flex items-center gap-1 ${statusClass}`}>
          {statusIcon} {statusText}
          {a.last_check_at && <span className="text-muted-foreground ml-1">· 校验于 {new Date(a.last_check_at).toLocaleString('zh-CN')}</span>}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解绑账号 {a.account_name || a.worker_account_key}？</AlertDialogTitle>
            <AlertDialogDescription>
              将从发布服务里删除该账号的 Cookie，已发布的内容不会受影响。下次使用需要重新扫码登录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">解绑</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

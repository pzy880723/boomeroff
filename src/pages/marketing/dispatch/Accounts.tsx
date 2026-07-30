// 账号管理:列出当前 shop 已绑定账号 + 加号按钮触发扫码绑定
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, RefreshCw, AlertCircle, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffectiveShop } from '@/hooks/useShops';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import type { SocialAccount } from '@/lib/dispatch';
import AddAccountDialog from './AddAccountDialog';
import { invokeFn } from '@/lib/invokeFn';

const ACCOUNT_PROFILE_API = 'https://aigc.boomeroff.top/api/marketing/account-profile';

async function updateAccountProfile(body: {
  account_id: string;
  action: 'remark' | 'refresh';
  remark?: string;
}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('登录状态已失效，请重新登录');

  const response = await fetch(ACCOUNT_PROFILE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.code !== 200) {
    throw new Error(result?.msg || `账号资料操作失败(${response.status})`);
  }
  return result.data as SocialAccount;
}

export default function AccountsTab() {
  const { shopId } = useEffectiveShop();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [workerOnline, setWorkerOnline] = useState(true);
  const [workerMessage, setWorkerMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null);
  const [remarkDraft, setRemarkDraft] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const autoRefreshAttempted = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    const workerPromise = invokeFn('dispatch-account-list', { body: { shop_id: shopId } });
    try {
      const dbResult = await supabase
        .from('social_accounts' as any)
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });
      if (dbResult.error) throw dbResult.error;

      const dbAccounts = (dbResult.data || []) as unknown as SocialAccount[];
      setAccounts(dbAccounts);
      setLoading(false);

      const workerResult = await workerPromise;
      const workerAccounts = ((workerResult.data as any)?.accounts || []) as SocialAccount[];
      const workerState = new Map(workerAccounts.map((account) => [account.id, account]));
      const rows = dbAccounts.map((account) => {
        const workerAccount = workerState.get(account.id);
        return {
          ...account,
          online: workerAccount?.online,
          worker_online: workerAccount?.worker_online,
          worker_message: (workerAccount as any)?.worker_message,
        };
      });
      setAccounts(rows);

      if (workerResult.error) {
        setWorkerOnline(false);
        setWorkerMessage(workerResult.error.message);
      } else {
        setWorkerOnline(!!(workerResult.data as any)?.worker_online);
        setWorkerMessage((workerResult.data as any)?.worker_message || '');
      }
    } catch (e: any) {
      toast({ title: '加载账号失败', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [shopId, toast]);

  useEffect(() => { void load(); }, [load]);

  // Realtime: 让同 shop 的店员看到账号实时变化
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase.channel(`accounts:${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_accounts', filter: `shop_id=eq.${shopId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [shopId, load]);

  const revoke = async (id: string) => {
    if (!confirm('确认解绑这个账号?')) return;
    const { error } = await invokeFn('dispatch-account-revoke', { body: { account_id: id } });
    if (error) toast({ title: '解绑失败', description: error.message, variant: 'destructive' });
    else { toast({ title: '已解绑' }); void load(); }
  };

  const openRemark = (account: SocialAccount) => {
    setEditingAccount(account);
    setRemarkDraft(account.account_remark || '');
  };

  const saveRemark = async () => {
    if (!editingAccount) return;
    setRemarkSaving(true);
    try {
      await updateAccountProfile({
        account_id: editingAccount.id,
        action: 'remark',
        remark: remarkDraft,
      });
      toast({ title: '账号备注已保存' });
      setEditingAccount(null);
      await load();
    } catch (e: any) {
      toast({ title: '保存备注失败', description: e.message, variant: 'destructive' });
    } finally {
      setRemarkSaving(false);
    }
  };

  const refreshProfile = useCallback(async (account: SocialAccount, silent = false) => {
    setRefreshingId(account.id);
    try {
      await updateAccountProfile({
        account_id: account.id,
        action: 'refresh',
      });
      if (!silent) toast({ title: '小红书主页资料已更新' });
      await load();
    } catch (e: any) {
      if (!silent) {
        toast({ title: '刷新主页资料失败', description: e.message, variant: 'destructive' });
      }
    } finally {
      setRefreshingId(null);
    }
  }, [load, toast]);

  useEffect(() => {
    const account = accounts.find((item) => (
      item.platform === 'xhs'
      && item.online !== false
      && !!item.worker_account_id
      && !item.profile_synced_at
      && !autoRefreshAttempted.current.has(item.id)
    ));
    if (!account) return;
    autoRefreshAttempted.current.add(account.id);
    void refreshProfile(account, true);
  }, [accounts, refreshProfile]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">已绑定 {accounts.length} 个账号</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="w-4 h-4 mr-1" /> 添加账号
          </Button>
        </div>
      </div>
      {!workerOnline && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>{workerMessage || '发布服务器暂时连不上，只能看缓存账号。新增和发布会失败，请稍后再试。'}</div>
        </div>
      )}
      {workerOnline && workerMessage && accounts.length === 0 && !loading && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-muted-foreground text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>{workerMessage}</div>
        </div>
      )}
      {accounts.length === 0 && !loading && (
        <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed rounded-xl">
          还没有账号。点右上 + 扫码绑定。
        </div>
      )}
      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="flex items-start gap-4 p-4 bg-card rounded-2xl border">
            {a.avatar_url ? (
              <img
                src={a.avatar_url}
                alt=""
                className="w-14 h-14 rounded-2xl object-cover bg-muted shrink-0"
              />
            ) : (
              <PlatformBadge platform={a.platform} size="md" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="text-base font-semibold truncate">{a.account_name || '主页资料待刷新'}</div>
                {a.online === true && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    在线
                  </span>
                )}
                {a.online === false && (
                  <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                    需重新绑定
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground line-clamp-2 whitespace-pre-line">
                {a.profile_bio || (a.platform === 'xhs' ? '主页介绍待刷新' : `${platformLabel(a.platform)}账号`)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{platformLabel(a.platform)}</span>
                {a.platform_account_id && <span>账号：{a.platform_account_id}</span>}
                {a.profile_synced_at && <span>资料已同步</span>}
              </div>
              {a.account_remark && (
                <div className="mt-2 inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
                  内部备注：{a.account_remark}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => openRemark(a)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> 编辑备注
              </Button>
              {a.platform === 'xhs' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refreshProfile(a)}
                  disabled={refreshingId === a.id}
                  title="刷新主页资料"
                >
                  {refreshingId === a.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  <span className="sr-only">刷新主页资料</span>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => revoke(a.id)} className="text-muted-foreground hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
                <span className="sr-only">解绑账号</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} shopId={shopId} onAdded={load} />
      <Dialog open={!!editingAccount} onOpenChange={(open) => { if (!open) setEditingAccount(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>编辑账号备注</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="account-remark">内部备注</Label>
            <Input
              id="account-remark"
              value={remarkDraft}
              onChange={(event) => setRemarkDraft(event.target.value)}
              maxLength={50}
              placeholder="例如：门店探店主号"
            />
            <div className="text-[11px] text-muted-foreground">
              备注仅供 BOOMER 内部管理，不会修改小红书主页。
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)} disabled={remarkSaving}>取消</Button>
            <Button onClick={() => void saveRemark()} disabled={remarkSaving}>
              {remarkSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              保存备注
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

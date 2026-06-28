// 账号管理:列出当前 shop 已绑定账号 + 加号按钮触发扫码绑定
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffectiveShop } from '@/hooks/useShops';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PlatformBadge, platformLabel } from '@/components/marketing/dispatch/PlatformBadge';
import type { SocialAccount } from '@/lib/dispatch';
import AddAccountDialog from './AddAccountDialog';
import { invokeFn } from '@/lib/invokeFn';

export default function AccountsTab() {
  const { shopId } = useEffectiveShop();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [workerOnline, setWorkerOnline] = useState(true);
  const [workerMessage, setWorkerMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeFn('dispatch-account-list', { body: { shop_id: shopId } });
      if (error) throw error;
      setAccounts((data?.accounts || []) as SocialAccount[]);
      setWorkerOnline(!!data?.worker_online);
      setWorkerMessage(data?.worker_message || '');
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
          <div key={a.id} className="flex items-center gap-3 p-3 bg-card rounded-xl border">
            <PlatformBadge platform={a.platform} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{a.account_name || '未命名账号'}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>{platformLabel(a.platform)}</span>
                {a.online === false && <span className="text-rose-600">· 发布服务器未确认，请重新绑定</span>}
                {a.online === true && <span className="text-emerald-600">· 在线</span>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => revoke(a.id)} className="text-muted-foreground hover:text-rose-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} shopId={shopId} onAdded={load} />
    </div>
  );
}

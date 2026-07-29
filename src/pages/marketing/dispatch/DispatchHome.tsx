import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  History as HistoryIcon,
  Play,
  Send,
  User2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveShop } from '@/hooks/useShops';
import { invokeFn } from '@/lib/invokeFn';
import { resolvePublishDraft } from '@/lib/publishFlow';
import AccountsTab from './Accounts';
import HistoryTab from './History';

const TABS = [
  { key: 'workbench', label: '发布', icon: Send },
  { key: 'history', label: '任务', icon: HistoryIcon },
  { key: 'accounts', label: '账号', icon: User2 },
] as const;

type TabKey = typeof TABS[number]['key'];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default function DispatchHome() {
  const { shopId, shops } = useEffectiveShop();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const requestedTab = sp.get('tab');
  const tab: TabKey = isTabKey(requestedTab) ? requestedTab : 'workbench';
  const [recentAsset, setRecentAsset] = useState<any | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [unavailableAccounts, setUnavailableAccounts] = useState(0);

  useEffect(() => {
    if (!shopId) {
      setRecentAsset(null);
      setLoadingRecent(false);
      setUnavailableAccounts(0);
      return;
    }

    let cancelled = false;
    setLoadingRecent(true);
    void supabase
      .from('marketing_assets' as any)
      .select('id,kind,output_url,output_text,tags,meta,created_at,shop_id')
      .eq('shop_id', shopId)
      .eq('kind', 'video')
      .not('output_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((result) => {
        if (!cancelled) {
          setRecentAsset((result.data as any) || null);
          setLoadingRecent(false);
        }
      });

    void invokeFn('dispatch-account-list', { body: { shop_id: shopId } }).then((result) => {
      if (cancelled) return;
      const accounts = ((result.data as any)?.accounts || []) as any[];
      setUnavailableAccounts(accounts.filter((account) =>
        account.cookie_status === 'expired' || account.online === false
      ).length);
    });

    return () => { cancelled = true; };
  }, [shopId]);

  const setTab = (next: TabKey) => {
    if (next === 'workbench') setSp({}, { replace: true });
    else setSp({ tab: next }, { replace: true });
  };

  const currentShopName = shops.find((shop) => shop.id === shopId)?.name || '当前门店';
  const recentDraft = recentAsset ? resolvePublishDraft(recentAsset) : null;
  const recentTitle = recentDraft?.title || recentAsset?.meta?.topic || '刚生成的视频';
  const recentPoster = recentAsset?.meta?.poster_url || recentAsset?.meta?.cover_url || '';

  return (
    <div className="min-h-screen pb-24 bg-muted/25">
      <PageHeader title="内容发布中心" back="/me/marketing" subtitle="选内容，确认文案，一键同步平台" />

      {tab === 'workbench' && (
        <main className="container mx-auto max-w-screen-md px-4 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold tracking-tight">
              <span className="text-primary">BOOMER</span> GO
            </div>
            <div className="rounded-full border bg-card px-2.5 py-1 text-[11px] text-muted-foreground">
              {currentShopName}
            </div>
          </div>

          <section className="relative overflow-hidden rounded-2xl bg-primary px-5 py-5 text-primary-foreground shadow-sm">
            <div className="relative z-10 max-w-[82%]">
              <div className="text-[11px] font-semibold opacity-80">最快 30 秒发起</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight">发布一条内容</h2>
              <p className="mt-1 text-xs leading-5 opacity-85">
                从共用素材库选择内容，系统默认同步全部可用账号。
              </p>
              <Button
                onClick={() => nav('/me/marketing/dispatch/workbench')}
                className="mt-4 h-10 bg-background text-primary hover:bg-background/90"
              >
                开始发布 <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[22px] border-white/10" />
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between">
              <h3 className="text-sm font-semibold">刚生成的内容</h3>
              <span className="text-[10px] text-muted-foreground">来自同一 AIGC 素材库</span>
            </div>

            {loadingRecent ? (
              <div className="flex gap-3 rounded-2xl border bg-card p-2.5 shadow-sm">
                <div className="h-24 w-[72px] animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-2 py-2">
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ) : recentAsset ? (
              <div className="flex gap-3 rounded-2xl border bg-card p-2.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => nav(`/me/marketing/dispatch/workbench?asset_id=${recentAsset.id}`)}
                  className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-xl bg-muted"
                >
                  {recentPoster ? (
                    <img src={recentPoster} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Play className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
                      <Play className="h-3 w-3 fill-white" />
                    </span>
                  </span>
                </button>
                <div className="min-w-0 flex-1 py-1">
                  <div className="line-clamp-2 text-sm font-semibold leading-5">{recentTitle}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    15 秒竖版 · AIGC 生成
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px]">视频</span>
                    {recentDraft?.body && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700">
                        文案已就绪
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="self-center"
                  onClick={() => nav(`/me/marketing/dispatch/workbench?asset_id=${recentAsset.id}`)}
                >
                  去发布
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-xs text-muted-foreground">
                暂无可发布视频，可先去 AI 创作中心生成内容。
              </div>
            )}
          </section>

          {unavailableAccounts > 0 && (
            <button
              type="button"
              onClick={() => setTab('accounts')}
              className="flex w-full items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>{unavailableAccounts} 个账号需要重新登录。</strong>
                <br />不会影响其他正常账号发布。
              </span>
            </button>
          )}
        </main>
      )}

      {tab === 'history' && (
        <main className="container mx-auto max-w-screen-md px-4 pt-4">
          <HistoryTab />
        </main>
      )}

      {tab === 'accounts' && (
        <main className="container mx-auto max-w-screen-md px-4 pt-4">
          <AccountsTab />
        </main>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid h-16 max-w-screen-md grid-cols-3 px-4">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={active ? 'text-primary' : 'text-muted-foreground'}
              >
                <Icon className={`mx-auto mb-0.5 h-5 w-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

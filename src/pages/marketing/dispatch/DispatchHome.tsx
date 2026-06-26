// 内容分发中心三 Tab 容器:工作台 / 历史 / 账号
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Send, History as HistoryIcon, User2 } from 'lucide-react';
import AccountsTab from './Accounts';
import HistoryTab from './History';
import { Button } from '@/components/ui/button';

const TABS = [
  { key: 'workbench', label: '发布工作台', icon: Send },
  { key: 'history',   label: '发布历史',   icon: HistoryIcon },
  { key: 'accounts',  label: '账号管理',   icon: User2 },
] as const;

export default function DispatchHome() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as typeof TABS[number]['key']) || 'workbench';
  const nav = useNavigate();

  useEffect(() => {
    if (tab === 'workbench') {
      // 工作台是独立页;Home 顶 Tab 点击它就跳过去
      nav('/me/marketing/dispatch/workbench', { replace: true });
    }
  }, [tab, nav]);

  const setTab = (k: string) => {
    if (k === 'workbench') {
      nav('/me/marketing/dispatch/workbench');
      return;
    }
    setSp({ tab: k }, { replace: true });
  };

  return (
    <div className="min-h-screen pb-24 bg-background">
      <PageHeader title="内容分发中心" subtitle="抖音 · 小红书 · 视频号 · 快手 · B站" />
      <div className="px-4 pt-3">
        <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === tab;
            return (
              <Button
                key={t.key}
                variant="ghost"
                size="sm"
                onClick={() => setTab(t.key)}
                className={`flex items-center justify-center gap-1.5 text-xs h-9 ${active ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="px-4 mt-4">
        {tab === 'history' && <HistoryTab />}
        {tab === 'accounts' && <AccountsTab />}
      </div>
    </div>
  );
}

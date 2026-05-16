// 抽屉里的"仪表盘 Tab"——把原来 FloatingDashboard 的内容拆出来便于懒加载
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, ListChecks, Bell, CalendarDays } from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useNotifications } from '@/hooks/useNotifications';
import { useTasks } from '@/hooks/useTasks';
import { useAuth } from '@/hooks/useAuth';
import { ProfileHeaderCard } from '../dashboard/ProfileHeaderCard';
import { TodayPanel } from '../dashboard/TodayPanel';
import { TasksPanel } from '../dashboard/TasksPanel';
import { MessagesPanel } from '../dashboard/MessagesPanel';
import { SchedulePanel } from '../dashboard/SchedulePanel';

const INNER_TAB_KEY = 'dashboard_active_tab_v1';

export function DashboardInner({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const data = useDashboardData(!!user);
  const notif = useNotifications();
  const tasks = useTasks();

  const [tab, setTab] = useState<string>(() => {
    try { return localStorage.getItem(INNER_TAB_KEY) || 'today'; } catch { return 'today'; }
  });
  const setTabPersist = (v: string) => {
    setTab(v);
    try { localStorage.setItem(INNER_TAB_KEY, v); } catch {}
  };

  const go = (path: string) => {
    onClose();
    setTimeout(() => navigate(path), 240);
  };

  useEffect(() => { /* noop */ }, []);

  const tabBadge = (n: number) =>
    n > 0 ? (
      <span className="ml-1 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-[9px] font-bold text-accent-foreground inline-flex items-center justify-center tabular-nums">
        {n > 9 ? '9+' : n}
      </span>
    ) : null;

  const tabTriggerCls =
    'flex-1 rounded-lg text-[12px] gap-1 py-1.5 ' +
    'text-[hsl(var(--primary-foreground)/0.55)] ' +
    'data-[state=active]:bg-[hsl(var(--accent)/0.18)] data-[state=active]:text-[hsl(var(--primary-foreground))]';

  return (
    <div className="flex flex-col h-full">
      <div className="relative shrink-0">
        <ProfileHeaderCard data={data} />
      </div>

      <Tabs value={tab} onValueChange={setTabPersist} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 shrink-0">
          <TabsList className="w-full bg-[hsl(var(--accent)/0.06)] border border-[hsl(var(--accent)/0.18)] rounded-xl p-1 h-auto">
            <TabsTrigger value="today" className={tabTriggerCls}>
              <BarChart3 className="w-3.5 h-3.5" />
              今日
            </TabsTrigger>
            <TabsTrigger value="tasks" className={tabTriggerCls}>
              <ListChecks className="w-3.5 h-3.5" />
              任务{tabBadge(tasks.totalUnclaimedCount)}
            </TabsTrigger>
            <TabsTrigger value="messages" className={tabTriggerCls}>
              <Bell className="w-3.5 h-3.5" />
              消息{tabBadge(notif.unreadCount)}
            </TabsTrigger>
            <TabsTrigger value="schedule" className={tabTriggerCls}>
              <CalendarDays className="w-3.5 h-3.5" />
              排班
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-28">
          <TabsContent value="today" className="m-0 outline-none">
            <TodayPanel data={data} />
          </TabsContent>
          <TabsContent value="tasks" className="m-0 outline-none">
            <TasksPanel tasks={tasks} onClaimed={() => data.refresh()} onNavigate={go} />
          </TabsContent>
          <TabsContent value="messages" className="m-0 outline-none">
            <MessagesPanel
              items={notif.items}
              unread={notif.unreadCount}
              onRead={notif.markRead}
              onReadAll={notif.markAllRead}
              learning={data.learning}
              navigate={go}
            />
          </TabsContent>
          <TabsContent value="schedule" className="m-0 outline-none">
            <SchedulePanel data={data} navigate={go} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

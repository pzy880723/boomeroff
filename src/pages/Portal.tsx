import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { UserTable } from '@/components/admin/UserTable';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { OfficialKnowledgeManager } from '@/components/admin/OfficialKnowledgeManager';
import { CommunityModeration } from '@/components/admin/CommunityModeration';
import { AISettingsPanel } from '@/components/admin/AISettingsPanel';
import { DeploymentSettingsPanel } from '@/components/admin/DeploymentSettingsPanel';
import { CorrectionReviewPanel } from '@/components/admin/CorrectionReviewPanel';

import { ShiftSettingsPanel } from '@/components/admin/ShiftSettingsPanel';
import { ScheduleManager } from '@/components/admin/ScheduleManager';
import { KbManager } from '@/components/admin/KbManager';
import { ShopManager } from '@/components/admin/ShopManager';
import { RolePermissionManager } from '@/components/admin/RolePermissionManager';
import { NotificationManager } from '@/components/admin/NotificationManager';
import { ActivityReviewPanel } from '@/components/admin/ActivityReviewPanel';
import { SmsTestPanel } from '@/components/admin/SmsTestPanel';
import { MarketingPresetsPanel } from '@/components/admin/MarketingPresetsPanel';
import { BrandKbManager } from '@/components/admin/BrandKbManager';
import { BackupPanel } from '@/components/admin/BackupPanel';
import { AuditLogTable } from '@/components/admin/AuditLogTable';



import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Shield, Users, LogOut, AlertCircle, Sparkles, BadgeCheck,
  MessageSquare, MessageSquareWarning, Menu,
  CalendarDays, Clock, BookOpen, MessagesSquare, Store, ShieldCheck,
  UserCog, Building2, Library, Megaphone, Settings, Ticket, Database, History,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { lockPortal } from '@/hooks/useAdminPortal';
import { usePermissions, type PermissionKey } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

type TabKey = 'users' | 'audit' | 'roles' | 'shops' | 'schedule' | 'shifts' | 'sop' | 'qa' | 'official' | 'brand_kb' | 'community' | 'corrections' | 'ai' | 'deploy' | 'notifications' | 'activity_review' | 'sms_test' | 'marketing_presets' | 'backup';

type MenuItem = { key: TabKey; label: string; icon: typeof Users; perm: PermissionKey };
type MenuGroup = { key: string; label: string; icon: typeof Users; items: MenuItem[] };

const MENU_GROUPS: MenuGroup[] = [
  {
    key: 'people', label: '人员', icon: UserCog, items: [
      { key: 'users', label: '用户管理', icon: Users, perm: 'user.read' },
      { key: 'audit', label: '操作日志', icon: History, perm: 'user.read' },
      { key: 'roles', label: '角色与权限', icon: ShieldCheck, perm: 'role.manage' },
    ],
  },
  {
    key: 'ops', label: '门店运营', icon: Building2, items: [
      { key: 'shops', label: '门店管理', icon: Store, perm: 'shop.write' },
      { key: 'schedule', label: '排班管理', icon: CalendarDays, perm: 'schedule.write' },
      { key: 'shifts', label: '班次设置', icon: Clock, perm: 'shift.write' },
    ],
  },
  {
    key: 'kb', label: '知识库', icon: Library, items: [
      { key: 'sop', label: '门店手册', icon: BookOpen, perm: 'shop.kb.write' },
      { key: 'qa', label: '顾客 Q&A', icon: MessagesSquare, perm: 'shop.kb.write' },
      { key: 'official', label: '官方知识', icon: BadgeCheck, perm: 'knowledge.official.write' },
      { key: 'brand_kb', label: '品牌大模型库', icon: Database, perm: 'knowledge.official.write' },
    ],
  },
  {
    key: 'social', label: '社区', icon: Megaphone, items: [
      { key: 'community', label: 'BOOMER 圈', icon: MessageSquare, perm: 'community.moderate' },
      { key: 'corrections', label: '纠错审核', icon: MessageSquareWarning, perm: 'correction.review' },
      { key: 'notifications', label: '系统通知', icon: Megaphone, perm: 'role.manage' },
    ],
  },
  {
    key: 'vouchers', label: '活动审核', icon: Ticket, items: [
      { key: 'activity_review', label: '活动申请审核', icon: BadgeCheck, perm: 'voucher.manage' },
    ],
  },
  {
    key: 'system', label: '系统', icon: Settings, items: [
      { key: 'ai', label: 'AI 模型', icon: Sparkles, perm: 'settings.ai' },
      { key: 'marketing_presets', label: '营销预设', icon: Megaphone, perm: 'settings.ai' },
      { key: 'deploy', label: '部署域名', icon: Settings, perm: 'settings.ai' },
      { key: 'sms_test', label: '短信测试', icon: MessageSquare, perm: 'settings.ai' },
      { key: 'backup', label: '数据备份', icon: Database, perm: 'settings.ai' },
    ],
  },
];


export default function Portal() {
  const { role } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const navigate = useNavigate();

  // 按权限过滤菜单
  const visibleGroups = useMemo(() => {
    return MENU_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((it) => can(it.perm)) }))
      .filter((g) => g.items.length > 0);
  }, [can, permLoading]);

  const visibleItems = useMemo(
    () => visibleGroups.flatMap((g) => g.items.map((item) => ({ item, group: g }))),
    [visibleGroups]
  );

  const [tab, setTab] = useState<TabKey | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // 默认选中第一个有权限的 tab
  const effectiveTab: TabKey | null = tab && visibleItems.find((e) => e.item.key === tab)
    ? tab
    : (visibleItems[0]?.item.key ?? null);

  const handleExit = () => {
    lockPortal();
    navigate('/');
  };

  const currentEntry = effectiveTab
    ? visibleItems.find((e) => e.item.key === effectiveTab)
    : undefined;
  const current = currentEntry?.item;
  const currentGroup = currentEntry?.group;

  return (
    <div className="min-h-screen bg-gradient-surface">
      <Header />
      <main className="container py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 flex flex-col h-full">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
                  <SheetTitle className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    后台管理
                  </SheetTitle>
                </SheetHeader>
                <nav className="p-2 flex-1 overflow-y-auto overscroll-contain">
                  {visibleGroups.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                      当前账号没有任何后台权限
                    </p>
                  ) : (
                    <Accordion
                      type="multiple"
                      defaultValue={currentGroup ? [currentGroup.key] : []}
                      className="w-full"
                    >
                      {visibleGroups.map((g) => {
                        const GIcon = g.icon;
                        return (
                          <AccordionItem key={g.key} value={g.key} className="border-none">
                            <AccordionTrigger className="px-3 py-2 rounded-lg hover:bg-muted hover:no-underline text-sm">
                              <span className="flex items-center gap-2.5">
                                <GIcon className="w-4 h-4 shrink-0" />
                                {g.label}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-1">
                              {g.items.map((m) => {
                                const Icon = m.icon;
                                const active = effectiveTab === m.key;
                                return (
                                  <button
                                    key={m.key}
                                    onClick={() => { setTab(m.key); setMenuOpen(false); }}
                                    className={cn(
                                      'w-full flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm transition-colors',
                                      active
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'hover:bg-muted text-foreground'
                                    )}
                                  >
                                    <Icon className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{m.label}</span>
                                  </button>
                                );
                              })}
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight truncate">
                {current?.label ?? '后台管理'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {currentGroup ? `${currentGroup.label} · 仅授权人员可见` : '当前账号没有任何后台权限'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExit} className="rounded-full shrink-0">
            <LogOut className="w-4 h-4 mr-1.5" />
            退出
          </Button>
        </div>

        {!permLoading && visibleItems.length === 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              当前账号没有任何后台权限。如需访问，请联系管理员为你的角色分配相应权限。
            </AlertDescription>
          </Alert>
        )}

        {effectiveTab && (
          <Card className="overflow-hidden border-border/60 shadow-soft p-3 sm:p-5">
            {effectiveTab === 'users' && can('user.read') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">所有用户</h2>
                  {can('user.create') && <CreateUserDialog />}
                </div>
                <UserTable />
              </div>
            )}
            {effectiveTab === 'roles' && can('role.manage') && <RolePermissionManager />}
            {effectiveTab === 'shops' && can('shop.write') && <ShopManager />}
            {effectiveTab === 'schedule' && can('schedule.write') && <ScheduleManager />}
            {effectiveTab === 'shifts' && can('shift.write') && <ShiftSettingsPanel />}
            {effectiveTab === 'sop' && can('shop.kb.write') && <KbManager type="sop" title="门店手册" />}
            {effectiveTab === 'qa' && can('shop.kb.write') && <KbManager type="qa" title="顾客 Q&A" />}
            {effectiveTab === 'official' && can('knowledge.official.write') && <OfficialKnowledgeManager />}
            {effectiveTab === 'brand_kb' && can('knowledge.official.write') && <BrandKbManager />}
            {effectiveTab === 'community' && can('community.moderate') && <CommunityModeration />}
            {effectiveTab === 'corrections' && can('correction.review') && <CorrectionReviewPanel />}
            {effectiveTab === 'ai' && can('settings.ai') && <AISettingsPanel />}
            {effectiveTab === 'marketing_presets' && can('settings.ai') && <MarketingPresetsPanel />}

            {effectiveTab === 'deploy' && can('settings.ai') && <DeploymentSettingsPanel />}
            
            
            {effectiveTab === 'notifications' && can('role.manage') && <NotificationManager />}
            {effectiveTab === 'activity_review' && can('voucher.manage') && <ActivityReviewPanel />}
            {effectiveTab === 'sms_test' && can('settings.ai') && <SmsTestPanel />}
            {effectiveTab === 'backup' && can('settings.ai') && <BackupPanel />}
          </Card>
        )}
      </main>
    </div>
  );
}

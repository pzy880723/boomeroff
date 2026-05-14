import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { UserTable } from '@/components/admin/UserTable';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { OfficialKnowledgeManager } from '@/components/admin/OfficialKnowledgeManager';
import { CommunityModeration } from '@/components/admin/CommunityModeration';
import { AISettingsPanel } from '@/components/admin/AISettingsPanel';
import { CorrectionReviewPanel } from '@/components/admin/CorrectionReviewPanel';
import { XianyuCacheManager } from '@/components/admin/XianyuCacheManager';
import { ShiftSettingsPanel } from '@/components/admin/ShiftSettingsPanel';
import { ScheduleManager } from '@/components/admin/ScheduleManager';
import { KbManager } from '@/components/admin/KbManager';
import { ShopManager } from '@/components/admin/ShopManager';
import { RolePermissionManager } from '@/components/admin/RolePermissionManager';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Shield, Users, LogOut, AlertCircle, Sparkles, BadgeCheck,
  MessageSquare, MessageSquareWarning, TrendingUp, Menu,
  CalendarDays, Clock, BookOpen, MessagesSquare, Store, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { lockPortal } from '@/hooks/useAdminPortal';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

type TabKey = 'users' | 'roles' | 'shops' | 'schedule' | 'shifts' | 'sop' | 'qa' | 'official' | 'community' | 'corrections' | 'ai' | 'xianyu';

const MENU: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: 'users', label: '用户管理', icon: Users },
  { key: 'shops', label: '门店管理', icon: Store },
  { key: 'schedule', label: '排班管理', icon: CalendarDays },
  { key: 'shifts', label: '班次设置', icon: Clock },
  { key: 'sop', label: '门店 SOP', icon: BookOpen },
  { key: 'qa', label: '顾客 Q&A', icon: MessagesSquare },
  { key: 'official', label: '官方知识', icon: BadgeCheck },
  { key: 'community', label: '中古圈', icon: MessageSquare },
  { key: 'corrections', label: '纠错审核', icon: MessageSquareWarning },
  { key: 'ai', label: 'AI 模型', icon: Sparkles },
  { key: 'xianyu', label: '闲鱼行情', icon: TrendingUp },
];

export default function Portal() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('users');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleExit = () => {
    lockPortal();
    navigate('/');
  };

  const current = useMemo(() => MENU.find((m) => m.key === tab) ?? MENU[0], [tab]);

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
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
                  <SheetTitle className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    后台管理
                  </SheetTitle>
                </SheetHeader>
                <nav className="p-2">
                  {MENU.map((m) => {
                    const Icon = m.icon;
                    const active = tab === m.key;
                    return (
                      <button
                        key={m.key}
                        onClick={() => { setTab(m.key); setMenuOpen(false); }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
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
                </nav>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight truncate">
                {current.label}
              </h1>
              <p className="text-xs text-muted-foreground">后台管理 · 仅授权人员可见</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExit} className="rounded-full shrink-0">
            <LogOut className="w-4 h-4 mr-1.5" />
            退出
          </Button>
        </div>

        {role !== 'admin' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              当前登录账号不是管理员，部分管理操作可能因权限被拒绝。请使用管理员账号登录后再操作。
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden border-border/60 shadow-soft p-3 sm:p-5">
          {tab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-semibold">所有用户</h2>
                <CreateUserDialog />
              </div>
              <UserTable />
            </div>
          )}
          {tab === 'shops' && <ShopManager />}
          {tab === 'schedule' && <ScheduleManager />}
          {tab === 'shifts' && <ShiftSettingsPanel />}
          {tab === 'sop' && <KbManager type="sop" title="门店 SOP" />}
          {tab === 'qa' && <KbManager type="qa" title="顾客 Q&A" />}
          {tab === 'official' && <OfficialKnowledgeManager />}
          {tab === 'community' && <CommunityModeration />}
          {tab === 'corrections' && <CorrectionReviewPanel />}
          {tab === 'ai' && <AISettingsPanel />}
          {tab === 'xianyu' && <XianyuCacheManager />}
        </Card>
      </main>
    </div>
  );
}

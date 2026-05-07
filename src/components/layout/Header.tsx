import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LogOut, User, Shield, History } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@/types';
import { DailyKnowledgeCard } from '@/components/dashboard/DailyKnowledgeCard';
import { useLogoTapCounter, verifyPortalPassword, unlockPortal } from '@/hooks/useAdminPortal';
import { toast } from 'sonner';
import logo from '@/assets/boomer-off-vintage-logo.png';

export function Header() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwdError, setPwdError] = useState(false);

  const { tap } = useLogoTapCounter(() => {
    setPwd('');
    setPwdError(false);
    setPwdOpen(true);
  });

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    tap();
    // 单击行为：回首页（仅在不在首页时跳转）
    if (window.location.pathname !== '/') {
      navigate('/');
    }
  };

  const handleVerify = () => {
    if (verifyPortalPassword(pwd)) {
      unlockPortal();
      setPwdOpen(false);
      setPwd('');
      toast.success('已进入后台');
      navigate('/portal');
    } else {
      setPwdError(true);
    }
  };

  const getInitials = (email: string) => email.charAt(0).toUpperCase();

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'operator':
        return 'default';
      case 'assistant':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 glass safe-top">
      <div className="container flex h-15 items-center justify-between gap-2" style={{ height: '3.75rem' }}>
        <button
          type="button"
          onClick={handleLogoClick}
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity min-w-0 shrink-0 select-none"
          aria-label="首页"
        >
          <img
            src={logo}
            alt="中古商品知识系统"
            draggable={false}
            className="h-[5.25rem] w-[5.25rem] sm:h-[6.5rem] sm:w-[6.5rem] rounded-lg object-contain shrink-0"
          />
        </button>

        <div className="flex items-center gap-1">
          <DailyKnowledgeCard />

          <Link to="/history">
            <Button variant="ghost" size="sm" className="gap-1.5 h-9 px-2.5 sm:px-3">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">历史记录</span>
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-1 ring-1 ring-border/60">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-sm font-medium">
                    {user?.email ? getInitials(user.email) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-2">
                  <p className="text-sm font-medium leading-none truncate">{user?.email}</p>
                  {role && (
                    <Badge variant={getRoleBadgeVariant(role)} className="w-fit">
                      <Shield className="w-3 h-3 mr-1" />
                      {ROLE_LABELS[role]}
                    </Badge>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>个人资料</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              后台访问验证
            </DialogTitle>
            <DialogDescription>
              请输入后台访问密码以继续。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="请输入密码"
              value={pwd}
              autoFocus
              onChange={(e) => {
                setPwd(e.target.value);
                if (pwdError) setPwdError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerify();
              }}
              className={pwdError ? 'border-destructive' : ''}
            />
            {pwdError && <p className="text-xs text-destructive">密码不正确</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdOpen(false)}>取消</Button>
            <Button onClick={handleVerify}>进入后台</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

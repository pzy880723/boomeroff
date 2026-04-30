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
import { LogOut, User, Settings, Shield, History, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@/types';
import { DailyKnowledgeCard } from '@/components/dashboard/DailyKnowledgeCard';
import logo from '@/assets/boomer-off-vintage-logo.png';

export function Header() {
  const { user, role, signOut } = useAuth();

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

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
      <div className="container flex h-20 items-center justify-between gap-2">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity min-w-0 shrink-0">
          <img src={logo} alt="中古商品实时识别系统" className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-contain shrink-0" />
        </Link>

        <div className="flex items-center gap-1">
          <DailyKnowledgeCard />

          <Link to="/history">
            <Button variant="ghost" size="sm" className="gap-1.5 h-9 px-2.5 sm:px-3">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">历史记录</span>
            </Button>
          </Link>

          {role === 'admin' && (
            <Link to="/admin/users">
              <Button variant="ghost" size="sm" className="gap-1.5 h-9 px-2.5 sm:px-3">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">用户管理</span>
              </Button>
            </Link>
          )}

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
              {role === 'admin' && (
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>系统设置</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

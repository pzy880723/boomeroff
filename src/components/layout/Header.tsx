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
import logo from '@/assets/boomer-off-logo.png';

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
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="hover:opacity-80 transition-opacity">
          <img src={logo} alt="BOOMER-OFF 智能直播系统" className="h-8 w-auto object-contain" />
        </Link>

        <div className="flex items-center gap-2">
          <Link to="/history">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">历史记录</span>
            </Button>
          </Link>
          
          {role === 'admin' && (
            <Link to="/admin/users">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">用户管理</span>
              </Button>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>
                    {user?.email ? getInitials(user.email) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-2">
                  <p className="text-sm font-medium leading-none">{user?.email}</p>
                  {role && (
                    <Badge
                      variant={getRoleBadgeVariant(role)}
                      className="w-fit"
                    >
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

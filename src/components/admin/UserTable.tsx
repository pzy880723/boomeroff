import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RoleEditor } from './RoleEditor';
import { ROLE_LABELS, AppRole } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Mail, Calendar, MoreHorizontal, UserX, Trash2, PlayCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface UserWithRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  suspended: boolean;
  suspended_at: string | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function UserTable() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const { user: currentUser } = useAuth();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role,
          created_at,
          suspended,
          suspended_at,
          profiles!user_roles_user_id_fkey(display_name, avatar_url)
        `);

      if (rolesError) throw rolesError;

      const usersWithProfiles = (roles || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role as AppRole,
        created_at: r.created_at,
        suspended: r.suspended || false,
        suspended_at: r.suspended_at,
        profile: r.profiles,
      }));

      setUsers(usersWithProfiles);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update role:', error);
      return false;
    }

    fetchUsers();
    return true;
  };

  const handleSuspend = async (user: UserWithRole) => {
    const newSuspendedState = !user.suspended;
    const { error } = await supabase
      .from('user_roles')
      .update({ 
        suspended: newSuspendedState,
        suspended_at: newSuspendedState ? new Date().toISOString() : null
      })
      .eq('user_id', user.user_id);

    if (error) {
      toast.error('操作失败');
      return;
    }

    toast.success(newSuspendedState ? '用户已暂停' : '用户已恢复');
    fetchUsers();
  };

  const handleDelete = async () => {
    if (!userToDelete) return;

    try {
      // Delete user role
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userToDelete.user_id);

      if (roleError) throw roleError;

      // Delete profile
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userToDelete.user_id);

      toast.success('用户已删除');
      fetchUsers();
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    return role === 'admin' ? 'destructive' : 'secondary';
  };

  const isCurrentUser = (userId: string) => currentUser?.id === userId;

  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <div className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  用户
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1.5">
                  <Shield className="h-4 w-4" />
                  角色
                </div>
              </TableHead>
              <TableHead>状态</TableHead>
              <TableHead>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  加入时间
                </div>
              </TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  暂无用户
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className={user.suspended ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {user.profile?.display_name || '未设置昵称'}
                        {isCurrentUser(user.user_id) && (
                          <span className="text-xs text-muted-foreground ml-1">(我)</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {user.user_id.slice(0, 8)}...
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.suspended ? (
                      <Badge variant="outline" className="text-destructive border-destructive">
                        已暂停
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        正常
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <RoleEditor
                        currentRole={user.role}
                        onRoleChange={(newRole) => handleRoleChange(user.user_id, newRole)}
                        disabled={isCurrentUser(user.user_id)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isCurrentUser(user.user_id)}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleSuspend(user)}>
                            {user.suspended ? (
                              <>
                                <PlayCircle className="mr-2 h-4 w-4" />
                                恢复账号
                              </>
                            ) : (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                暂停账号
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              setUserToDelete(user);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除用户
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除用户「{userToDelete?.profile?.display_name || '未设置昵称'}」。
              此操作将删除该用户的角色和资料，但不会删除其认证账号。该用户将无法再登录系统。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

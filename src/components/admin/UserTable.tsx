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
import { Shield, Mail, Calendar, MoreHorizontal, UserX, Trash2, PlayCircle, CheckCircle2, KeyRound, IdCard, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { ResetUserPasswordDialog } from './ResetUserPasswordDialog';
import { StaffProfileDialog } from './StaffProfileDialog';

interface UserWithRole {
  id: string;
  user_id: string;
  role: AppRole;
  role_code: string | null;
  created_at: string;
  suspended: boolean;
  suspended_at: string | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  staff?: {
    real_name: string | null;
    shop_id: string | null;
  };
}

export function UserTable() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const [resetUser, setResetUser] = useState<UserWithRole | null>(null);
  const [profileUser, setProfileUser] = useState<UserWithRole | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});
  const [shopNameMap, setShopNameMap] = useState<Record<string, string>>({});
  const [shifts, setShifts] = useState<{ code: string; name: string }[]>([]);
  const { user: currentUser } = useAuth();
  const { can } = usePermissions();

  useEffect(() => {
    void supabase.from('app_roles').select('code, name').then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { m[r.code] = r.name; });
      setRoleNameMap(m);
    });
    void supabase.from('shops' as any).select('id, name').then(({ data }) => {
      const m: Record<string, string> = {};
      (data ?? []).forEach((s: any) => { m[s.id] = s.name; });
      setShopNameMap(m);
    });
    void supabase.from('shop_shifts' as any).select('code, name').eq('active', true).order('sort_order').then(({ data }) => {
      setShifts((data as any) || []);
    });
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('id, user_id, role, role_code, created_at, suspended, suspended_at')
        .order('created_at', { ascending: false });

      if (rolesError) throw rolesError;

      const userIds = (roles || []).map((r: any) => r.user_id);
      let profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      let staffMap: Record<string, { real_name: string | null; shop_id: string | null }> = {};
      if (userIds.length > 0) {
        const [{ data: profs }, { data: staff }] = await Promise.all([
          supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url')
            .in('user_id', userIds),
          supabase
            .from('staff_profiles' as any)
            .select('user_id, real_name, shop_id')
            .in('user_id', userIds),
        ]);
        (profs || []).forEach((p: any) => {
          profileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
        });
        (staff || []).forEach((s: any) => {
          staffMap[s.user_id] = { real_name: s.real_name, shop_id: s.shop_id };
        });
      }

      const usersWithProfiles: UserWithRole[] = (roles || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role as AppRole,
        role_code: r.role_code ?? (r.role === 'admin' ? 'super_admin' : 'staff'),
        created_at: r.created_at,
        suspended: r.suspended || false,
        suspended_at: r.suspended_at,
        profile: profileMap[r.user_id],
        staff: staffMap[r.user_id],
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

  const handleRoleChange = async (userId: string, newRoleCode: string) => {
    // 同步写入旧 enum 字段，保持现有 RLS 不破：super_admin → admin，其它 → anchor
    const legacy = newRoleCode === 'super_admin' ? 'admin' : 'anchor';
    const { error } = await supabase
      .from('user_roles')
      .update({ role_code: newRoleCode, role: legacy })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update role:', error);
      return false;
    }

    // 局部更新，避免整页重新加载导致滚动回到顶部
    setUsers((prev) =>
      prev.map((u) =>
        u.user_id === userId
          ? { ...u, role_code: newRoleCode, role: legacy as AppRole }
          : u,
      ),
    );
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

    toast.success(newSuspendedState ? '用户已暂停' : '已通过审核，用户可登录');
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

  const pendingCount = users.filter((u) => u.suspended).length;
  const filteredUsers = filter === 'pending' ? users.filter((u) => u.suspended) : users;

  return (
    <>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'pending')}>
        <TabsList>
          <TabsTrigger value="all">全部 ({users.length})</TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            待审核
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border mt-4">
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
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {filter === 'pending' ? '暂无待审核用户' : '暂无用户'}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id} className={user.suspended ? 'opacity-50' : ''}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {user.staff?.real_name || user.profile?.display_name || '未设置姓名'}
                        {isCurrentUser(user.user_id) && (
                          <span className="text-xs text-muted-foreground ml-1">(我)</span>
                        )}
                      </span>
                      {user.profile?.display_name && user.profile.display_name !== user.staff?.real_name && (
                        <span className="text-[11px] text-muted-foreground">
                          注册昵称：{user.profile.display_name}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Store className="h-3 w-3" />
                        {user.staff?.shop_id ? (shopNameMap[user.staff.shop_id] || '门店') : '未绑定门店'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role_code === 'super_admin' ? 'destructive' : 'secondary'}>
                      {roleNameMap[user.role_code ?? ''] ?? ROLE_LABELS[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.suspended ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        待审核
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
                      {user.suspended && !isCurrentUser(user.user_id) && (
                        <Button
                          size="sm"
                          onClick={() => handleSuspend(user)}
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          通过审核
                        </Button>
                      )}
                      <RoleEditor
                        currentRoleCode={user.role_code}
                        onChanged={(code) => handleRoleChange(user.user_id, code)}
                        disabled={isCurrentUser(user.user_id)}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={isCurrentUser(user.user_id)}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setProfileUser(user)}>
                            <IdCard className="mr-2 h-4 w-4" />
                            编辑姓名 / 门店
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleSuspend(user)}>
                            {user.suspended ? (
                              <>
                                <PlayCircle className="mr-2 h-4 w-4" />
                                通过审核 / 恢复账号
                              </>
                            ) : (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                暂停账号
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setResetUser(user)}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            重置密码
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

      {resetUser && (
        <ResetUserPasswordDialog
          open={!!resetUser}
          onOpenChange={(o) => !o && setResetUser(null)}
          userId={resetUser.user_id}
          displayName={resetUser.profile?.display_name || '该用户'}
        />
      )}

      {profileUser && (
        <StaffProfileDialog
          open={!!profileUser}
          onOpenChange={(o) => !o && setProfileUser(null)}
          userId={profileUser.user_id}
          displayName={profileUser.staff?.real_name || profileUser.profile?.display_name || '该用户'}
          shifts={shifts}
          onSaved={fetchUsers}
        />
      )}
    </>
  );
}

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
import { RoleEditor } from './RoleEditor';
import { ROLE_LABELS, AppRole } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Mail, Calendar } from 'lucide-react';

interface UserWithRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  email?: string;
}

export function UserTable() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // 获取用户角色和profiles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role,
          created_at,
          profiles!user_roles_user_id_fkey(display_name, avatar_url)
        `);

      if (rolesError) throw rolesError;

      // 处理数据格式
      const usersWithProfiles = (roles || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        role: r.role as AppRole,
        created_at: r.created_at,
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

    // 刷新列表
    fetchUsers();
    return true;
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    return role === 'admin' ? 'destructive' : 'secondary';
  };

  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
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
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                暂无用户
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {user.profile?.display_name || '未设置昵称'}
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
                <TableCell className="text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString('zh-CN')}
                </TableCell>
                <TableCell className="text-right">
                  <RoleEditor
                    currentRole={user.role}
                    onRoleChange={(newRole) => handleRoleChange(user.user_id, newRole)}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

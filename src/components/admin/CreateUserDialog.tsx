import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppRole, ROLE_LABELS } from '@/types';

interface CreateUserDialogProps {
  onCreated?: () => void;
}

export function CreateUserDialog({ onCreated }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AppRole>('anchor');

  const reset = () => {
    setUsername('');
    setPassword('');
    setShowPassword(false);
    setRole('anchor');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      toast.error('用户名仅支持字母、数字、下划线，3-32 位');
      return;
    }
    if (password.length < 6) {
      toast.error('密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'admin-create-user',
        { body: { username, password, role } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`用户 ${username} 已创建`);
      handleOpenChange(false);
      onCreated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '创建失败';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          新增用户
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增用户</DialogTitle>
          <DialogDescription>
            填写用户名和密码，创建后用户即可直接登录
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-username">用户名</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如：zhangsan"
              autoComplete="off"
              required
            />
            <p className="text-xs text-muted-foreground">
              仅支持字母、数字、下划线，3-32 位
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">密码</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>用户类型</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anchor">{ROLE_LABELS.anchor}</SelectItem>
                <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            创建用户
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

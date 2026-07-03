import { useEffect, useState } from 'react';
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
import { invokeFn } from '@/lib/invokeFn';

interface CreateUserDialogProps {
  onCreated?: () => void;
}

interface Shop { id: string; name: string }
interface RoleOption { code: string; name: string }

export function CreateUserDialog({ onCreated }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [realName, setRealName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleCode, setRoleCode] = useState('');
  const [shopId, setShopId] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [shopsRes, rolesRes] = await Promise.all([
        supabase
          .from('shops' as any)
          .select('id, name')
          .eq('active', true)
          .order('sort_order'),
        supabase
          .from('app_roles')
          .select('code, name')
          .order('sort_order'),
      ]);
      setShops((shopsRes.data as any) || []);
      const list = ((rolesRes.data as any) || []) as RoleOption[];
      setRoles(list);
      if (list.length > 0) {
        // 默认选「正式店员」，找不到就取最后一项
        const def = list.find((r) => r.code === 'staff') ?? list[list.length - 1];
        setRoleCode(def.code);
      }
    })();
  }, [open]);

  const reset = () => {
    setUsername('');
    setRealName('');
    setPhone('');
    setPassword('');
    setShowPassword(false);
    setRoleCode('');
    setShopId('');
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
    if (!shopId) {
      toast.error('请选择所属门店');
      return;
    }
    if (!roleCode) {
      toast.error('请选择用户类型');
      return;
    }

    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('手机号格式不正确');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await invokeFn(
        'admin-create-user',
        {
          body: {
            username,
            password,
            role_code: roleCode,
            real_name: realName.trim() || undefined,
            phone: phone.trim() || undefined,
            shop_id: shopId,
          },
        },
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
            <Label htmlFor="new-realname">真实姓名</Label>
            <Input
              id="new-realname"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="例如：张三"
              maxLength={32}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-phone">手机号（用于验证码登录）</Label>
            <Input
              id="new-phone"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="选填，例如 138xxxx1234"
            />
            <p className="text-xs text-muted-foreground">
              登记后该手机号可用于短信验证码登录（白名单制）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-shop">所属门店</Label>
            {shops.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                暂无可选门店，请先在「门店管理」创建门店
              </div>
            ) : (
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger id="new-shop">
                  <SelectValue placeholder="请选择门店" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            {roles.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                正在加载角色…
              </div>
            ) : (
              <Select value={roleCode} onValueChange={setRoleCode}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择用户类型" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || shops.length === 0 || roles.length === 0}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            创建用户
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

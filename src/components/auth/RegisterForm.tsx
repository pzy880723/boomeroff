import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_]{3,32}$/, '用户名仅支持字母、数字、下划线，3-32 位'),
    password: z.string().min(6, '密码至少 6 位').max(72, '密码过长'),
    confirmPassword: z.string(),
    shop_id: z.string().uuid('请选择所属门店'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });

interface RegisterFormProps {
  onBackToLogin: () => void;
}

interface Shop { id: string; name: string }

export function RegisterForm({ onBackToLogin }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [shopId, setShopId] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('shops' as any)
        .select('id, name')
        .eq('active', true)
        .order('sort_order');
      setShops((data as any) || []);
      setShopsLoading(false);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = registerSchema.safeParse({ username, password, confirmPassword, shop_id: shopId });
    if (!parsed.success) {
      toast({
        title: '输入有误',
        description: parsed.error.errors[0]?.message ?? '请检查输入',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'public-register',
        { body: { username, password, shop_id: shopId } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: '注册成功',
        description: '账号已提交，等待管理员审核通过后即可登录',
      });
      onBackToLogin();
    } catch (err) {
      toast({
        title: '注册失败',
        description: err instanceof Error ? err.message : '请稍后再试',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">注册账号</CardTitle>
        <CardDescription>
          注册后需等待管理员审核通过才能登录
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reg-username">用户名</Label>
            <Input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-32 位字母、数字、下划线"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-shop">所属门店</Label>
            {shopsLoading ? (
              <div className="text-xs text-muted-foreground py-2">加载中…</div>
            ) : shops.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                暂无可选门店，请联系管理员先创建门店
              </div>
            ) : (
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger id="reg-shop">
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
            <Label htmlFor="reg-password">密码</Label>
            <div className="relative">
              <Input
                id="reg-password"
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
            <Label htmlFor="reg-confirm">确认密码</Label>
            <Input
              id="reg-confirm"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              autoComplete="new-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || shops.length === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            提交注册
          </Button>
        </form>

        <button
          type="button"
          onClick={onBackToLogin}
          className="mt-4 w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回登录
        </button>
      </CardContent>
    </Card>
  );
}

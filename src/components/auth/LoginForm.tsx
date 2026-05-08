import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  account: z
    .string()
    .trim()
    .min(3, '账号至少 3 位')
    .max(255, '账号过长')
    .regex(/^([a-zA-Z0-9_]{3,32}|[^\s@]+@[^\s@]+\.[^\s@]+)$/, '请输入有效的用户名或邮箱'),
  password: z.string().min(6, '密码至少 6 位').max(72, '密码过长'),
});

interface LoginFormProps {
  onForgotPassword: () => void;
  onRegister?: () => void;
}

export function LoginForm({ onForgotPassword, onRegister }: LoginFormProps) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ account, password });
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
      const trimmed = parsed.data.account;
      const loginEmail = trimmed.includes('@')
        ? trimmed
        : `${trimmed.toLowerCase()}@boomeroff.local`;
      await signIn(loginEmail, password);
      toast({
        title: '登录成功',
        description: '欢迎回来！',
      });
    } catch (error) {
      toast({
        title: '登录失败',
        description: error instanceof Error ? error.message : '请检查用户名和密码',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">登录</CardTitle>
        <CardDescription>登录您的账户以使用商品识别助手</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account">用户名</Label>
            <Input
              id="account"
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密码</Label>
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-sm text-primary hover:underline"
              >
                忘记密码？
              </button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            登录
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground mt-4">
          还没有账号？{' '}
          <button
            type="button"
            onClick={onRegister}
            className="text-primary hover:underline font-medium"
          >
            注册账号
          </button>
        </p>
      </CardContent>
    </Card>
  );
}

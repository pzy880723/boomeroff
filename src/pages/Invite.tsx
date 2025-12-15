import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, UserPlus, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { AppRole, ROLE_LABELS } from '@/types';
import logo from '@/assets/boomer-off-logo.png';

interface InviteData {
  id: string;
  code: string;
  role: AppRole;
  expires_at: string;
  used_by: string | null;
}

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, session, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // 注册表单
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // 验证邀请码
  useEffect(() => {
    const verifyInvite = async () => {
      if (!code) {
        setError('无效的邀请链接');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('invitations')
          .select('id, code, role, expires_at, used_by')
          .eq('code', code)
          .single();

        if (fetchError || !data) {
          setError('邀请链接无效或已过期');
          setLoading(false);
          return;
        }

        if (data.used_by) {
          setError('此邀请链接已被使用');
          setLoading(false);
          return;
        }

        if (new Date(data.expires_at) < new Date()) {
          setError('邀请链接已过期');
          setLoading(false);
          return;
        }

        setInvite({
          ...data,
          role: data.role as AppRole,
        });
      } catch (err) {
        setError('验证邀请链接失败');
      } finally {
        setLoading(false);
      }
    };

    verifyInvite();
  }, [code]);

  // 已登录用户直接使用邀请
  useEffect(() => {
    const useInvite = async () => {
      if (!user || !invite || authLoading) return;

      // 检查用户是否已有角色
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (existingRole) {
        toast.info('你已经是团队成员了');
        navigate('/');
        return;
      }

      // 使用邀请
      try {
        // 标记邀请为已使用
        await supabase
          .from('invitations')
          .update({ used_by: user.id, used_at: new Date().toISOString() })
          .eq('id', invite.id);

        // 创建用户角色
        await supabase.from('user_roles').insert({
          user_id: user.id,
          role: invite.role,
        });

        toast.success('加入成功！');
        navigate('/');
      } catch (err) {
        toast.error('加入失败，请重试');
      }
    };

    useInvite();
  }, [user, invite, authLoading, navigate]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;

    setFormLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${window.location.origin}/invite/${code}`,
        },
      });

      if (signUpError) throw signUpError;

      toast.success('注册成功！');
      // 注册成功后，useEffect会自动处理邀请
    } catch (err: any) {
      toast.error(err.message || '注册失败');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={logo} alt="BOOMER-OFF" className="h-12 mx-auto mb-4" />
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>邀请无效</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={logo} alt="BOOMER-OFF" className="h-12 mx-auto mb-4" />
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <CardTitle>正在加入团队...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={logo} alt="BOOMER-OFF" className="h-12 mx-auto mb-4" />
          <UserPlus className="h-10 w-10 text-primary mx-auto mb-2" />
          <CardTitle>你被邀请加入团队</CardTitle>
          <CardDescription>
            完成注册即可加入，角色：
            <Badge variant="secondary" className="ml-1">
              {invite ? ROLE_LABELS[invite.role] : ''}
            </Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isRegistering ? (
            <div className="space-y-4">
              <Button onClick={() => setIsRegistering(true)} className="w-full">
                注册新账号
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">或</span>
                </div>
              </div>
              <Button variant="outline" onClick={() => navigate(`/auth?redirect=/invite/${code}`)} className="w-full">
                已有账号？登录
              </Button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">昵称</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="输入你的昵称"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="输入邮箱地址"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="设置密码（至少6位）"
                    minLength={6}
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
              <Button type="submit" disabled={formLoading} className="w-full">
                {formLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    注册中...
                  </>
                ) : (
                  '注册并加入'
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsRegistering(false)} className="w-full">
                返回
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

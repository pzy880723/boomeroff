import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound } from 'lucide-react';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <KeyRound className="h-12 w-12 text-primary mx-auto mb-2" />
        <CardTitle className="text-2xl">忘记密码</CardTitle>
        <CardDescription>
          本系统使用用户名登录，无法通过邮件自助找回。
          <br />
          请联系门店管理员，在「用户管理」中为你重置密码。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onBackToLogin} variant="outline" className="w-full">
          返回登录
        </Button>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { RegisterForm } from './RegisterForm';
import { PhoneLoginForm } from './PhoneLoginForm';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { APP_BRAND_LOGO, APP_BRAND_NAME } from '@/assets/brand';

type AuthMode = 'login' | 'forgot-password' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-surface relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40 [background:radial-gradient(circle_at_20%_10%,hsl(var(--accent)/0.15),transparent_40%),radial-gradient(circle_at_80%_90%,hsl(var(--primary)/0.12),transparent_40%)]" />
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-6 flex justify-center">
          <img
            src={APP_BRAND_LOGO}
            alt={APP_BRAND_NAME}
            width={96}
            height={96}
            loading="eager"
            decoding="async"
            className="h-20 sm:h-24 w-20 sm:w-24 object-contain rounded-2xl shadow-hard bg-white/60"
          />
        </div>

        {mode === 'login' && (
          <div className="bg-card border border-border/60 rounded-2xl p-4 sm:p-5 shadow-soft">
            <Tabs defaultValue="password" className="w-full">
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="password">账号密码</TabsTrigger>
                <TabsTrigger value="phone">手机验证码</TabsTrigger>
              </TabsList>
              <TabsContent value="password" className="mt-0">
                <LoginForm
                  onForgotPassword={() => setMode('forgot-password')}
                  onRegister={() => setMode('register')}
                />
              </TabsContent>
              <TabsContent value="phone" className="mt-0">
                <PhoneLoginForm />
              </TabsContent>
            </Tabs>
          </div>
        )}
        {mode === 'forgot-password' && <ForgotPasswordForm onBackToLogin={() => setMode('login')} />}
        {mode === 'register' && <RegisterForm onBackToLogin={() => setMode('login')} />}
      </div>
    </div>
  );
}

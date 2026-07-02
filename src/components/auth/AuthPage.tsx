import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { RegisterForm } from './RegisterForm';
import { APP_BRAND_LOGO, APP_BRAND_NAME, APP_BRAND_TAGLINE } from '@/assets/brand';

type AuthMode = 'login' | 'forgot-password' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-surface relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40 [background:radial-gradient(circle_at_20%_10%,hsl(var(--accent)/0.15),transparent_40%),radial-gradient(circle_at_80%_90%,hsl(var(--primary)/0.12),transparent_40%)]" />
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <img
            src={APP_BRAND_LOGO}
            alt={APP_BRAND_NAME}
            className="h-20 sm:h-24 w-20 sm:w-24 object-contain mx-auto mb-4 rounded-2xl shadow-hard"
          />
          <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight">
            {APP_BRAND_NAME}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">{APP_BRAND_TAGLINE} · AI 识物 · 知识共享 · 排班管理</p>
        </div>
        {mode === 'login' && (
          <LoginForm
            onForgotPassword={() => setMode('forgot-password')}
            onRegister={() => setMode('register')}
          />
        )}
        {mode === 'forgot-password' && <ForgotPasswordForm onBackToLogin={() => setMode('login')} />}
        {mode === 'register' && <RegisterForm onBackToLogin={() => setMode('login')} />}
      </div>
    </div>
  );
}

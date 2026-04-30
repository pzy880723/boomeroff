import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import logo from '@/assets/boomer-off-vintage-logo.png';

type AuthMode = 'login' | 'forgot-password';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <div className="mb-8 text-center">
        <img src={logo} alt="BOOMER-OFF Vintage" className="h-16 sm:h-20 w-auto object-contain mx-auto mb-3" />
        <h1 className="text-lg sm:text-xl font-semibold">中古商品实时识别系统</h1>
        <p className="text-muted-foreground text-sm mt-1">中古杂货 · AI 秒级识别 · 店员销售辅助</p>
      </div>
      {mode === 'login' && <LoginForm onForgotPassword={() => setMode('forgot-password')} />}
      {mode === 'forgot-password' && <ForgotPasswordForm onBackToLogin={() => setMode('login')} />}
    </div>
  );
}

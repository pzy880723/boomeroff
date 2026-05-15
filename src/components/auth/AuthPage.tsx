import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { RegisterForm } from './RegisterForm';
import logo from '@/assets/boomer-off-vintage-logo.png';

type AuthMode = 'login' | 'forgot-password' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-surface relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40 [background:radial-gradient(circle_at_20%_10%,hsl(var(--accent)/0.15),transparent_40%),radial-gradient(circle_at_80%_90%,hsl(var(--primary)/0.12),transparent_40%)]" />
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <img
            src={logo}
            alt="门店运营辅助系统"
            className="h-16 sm:h-20 w-auto object-contain mx-auto mb-4 drop-shadow-md"
          />
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            门店运营<span className="text-gradient-accent">辅助</span>系统
          </h1>
          <p className="text-muted-foreground text-sm mt-2">门店日常运营 · AI 识物 · 知识共享 · 排班管理</p>
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

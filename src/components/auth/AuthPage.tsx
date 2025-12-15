import { useState } from 'react';
import { LoginForm } from './LoginForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import logo from '@/assets/boomer-off-logo.png';

type AuthMode = 'login' | 'forgot-password';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-background to-muted">
      <div className="mb-8 text-center">
        <img src={logo} alt="BOOMER-OFF" className="h-12 sm:h-16 w-auto object-contain mx-auto mb-2" />
        <p className="text-muted-foreground">日本回流杂项 · 智能识别 · 话术生成</p>
      </div>
      {mode === 'login' && (
        <LoginForm 
          onForgotPassword={() => setMode('forgot-password')}
        />
      )}
      {mode === 'forgot-password' && (
        <ForgotPasswordForm onBackToLogin={() => setMode('login')} />
      )}
    </div>
  );
}

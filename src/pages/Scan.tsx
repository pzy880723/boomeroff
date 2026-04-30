import { useAuth } from '@/hooks/useAuth';
import { AuthPage } from '@/components/auth/AuthPage';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { LiveStreamPanel } from '@/components/dashboard/LiveStreamPanel';

export default function Scan() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <div className="flex flex-col">
      <Header />
      <LiveStreamPanel />
    </div>
  );
}

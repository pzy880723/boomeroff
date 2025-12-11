import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { LiveStreamPanel } from './LiveStreamPanel';

export function Dashboard() {
  const { role } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <LiveStreamPanel />
    </div>
  );
}

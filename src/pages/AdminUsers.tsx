import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { UserTable } from '@/components/admin/UserTable';
import { InviteDialog } from '@/components/admin/InviteDialog';
import { Navigate } from 'react-router-dom';
import { Users } from 'lucide-react';

export default function AdminUsers() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6" />
            <h1 className="text-2xl font-bold">用户管理</h1>
          </div>
          <InviteDialog />
        </div>
        <UserTable />
      </main>
    </div>
  );
}

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { UserTable } from '@/components/admin/UserTable';
import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { KnowledgeManager } from '@/components/admin/KnowledgeManager';
import { OfficialKnowledgeManager } from '@/components/admin/OfficialKnowledgeManager';
import { CommunityModeration } from '@/components/admin/CommunityModeration';
import { AISettingsPanel } from '@/components/admin/AISettingsPanel';
import { CorrectionReviewPanel } from '@/components/admin/CorrectionReviewPanel';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Users, LogOut, AlertCircle, BookOpen, Sparkles, BadgeCheck, MessageSquare, MessageSquareWarning } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { lockPortal } from '@/hooks/useAdminPortal';
import { useNavigate } from 'react-router-dom';

export default function Portal() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('users');

  const handleExit = () => {
    lockPortal();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-surface">
      <Header />
      <main className="container py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-soft">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight">后台管理</h1>
              <p className="text-xs text-muted-foreground">仅授权人员可见</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExit} className="rounded-full">
            <LogOut className="w-4 h-4 mr-1.5" />
            退出后台
          </Button>
        </div>

        {role !== 'admin' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              当前登录账号不是管理员，部分管理操作可能因权限被拒绝。请使用管理员账号登录后再操作。
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden border-border/60 shadow-soft">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <div className="border-b border-border/60 px-3 sm:px-4 pt-3 overflow-x-auto">
              <TabsList className="h-10">
                <TabsTrigger value="users" className="gap-1.5">
                  <Users className="w-4 h-4" />
                  用户管理
                </TabsTrigger>
                <TabsTrigger value="knowledge" className="gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  知识库
                </TabsTrigger>
                <TabsTrigger value="official" className="gap-1.5">
                  <BadgeCheck className="w-4 h-4" />
                  官方知识
                </TabsTrigger>
                <TabsTrigger value="community" className="gap-1.5">
                  <MessageSquare className="w-4 h-4" />
                  中古圈
                </TabsTrigger>
                <TabsTrigger value="corrections" className="gap-1.5">
                  <MessageSquareWarning className="w-4 h-4" />
                  纠错审核
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  AI 模型
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="users" className="p-3 sm:p-5 m-0 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-semibold">所有用户</h2>
                <CreateUserDialog />
              </div>
              <UserTable />
            </TabsContent>

            <TabsContent value="knowledge" className="p-3 sm:p-5 m-0">
              <KnowledgeManager />
            </TabsContent>

            <TabsContent value="official" className="p-3 sm:p-5 m-0">
              <OfficialKnowledgeManager />
            </TabsContent>

            <TabsContent value="community" className="p-3 sm:p-5 m-0">
              <CommunityModeration />
            </TabsContent>

            <TabsContent value="corrections" className="p-3 sm:p-5 m-0">
              <CorrectionReviewPanel />
            </TabsContent>

            <TabsContent value="ai" className="p-3 sm:p-5 m-0">
              <AISettingsPanel />
            </TabsContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
}

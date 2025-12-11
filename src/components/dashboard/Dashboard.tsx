import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { RecognitionPanel } from './RecognitionPanel';
import { ViewerPanel } from './ViewerPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, Eye, History, Users } from 'lucide-react';

export function Dashboard() {
  const { role } = useAuth();

  const canRecognize = role === 'admin' || role === 'operator';
  const canManage = role === 'admin';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-6">
        <Tabs defaultValue={canRecognize ? 'recognize' : 'view'} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            {canRecognize && (
              <TabsTrigger value="recognize" className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">识别</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="view" className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">观看</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">历史</span>
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="manage" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">管理</span>
              </TabsTrigger>
            )}
          </TabsList>

          {canRecognize && (
            <TabsContent value="recognize">
              <RecognitionPanel />
            </TabsContent>
          )}

          <TabsContent value="view">
            <ViewerPanel />
          </TabsContent>

          <TabsContent value="history">
            <div className="text-center py-12 text-muted-foreground">
              历史记录功能即将上线...
            </div>
          </TabsContent>

          {canManage && (
            <TabsContent value="manage">
              <div className="text-center py-12 text-muted-foreground">
                用户管理功能即将上线...
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

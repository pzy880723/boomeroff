import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { MainLayout } from "@/components/layout/MainLayout";
import { Loader2 } from "lucide-react";
import Scan from "./pages/Scan";

// 非首屏路由全部懒加载，减小首包体积
const OfficialLibrary = lazy(() => import("./pages/OfficialLibrary"));
const OfficialDetail = lazy(() => import("./pages/OfficialDetail"));
const MyLibrary = lazy(() => import("./pages/MyLibrary"));
const Community = lazy(() => import("./pages/Community"));
const Me = lazy(() => import("./pages/Me"));
const History = lazy(() => import("./pages/History"));
const Portal = lazy(() => import("./pages/Portal"));
const PortalGuard = lazy(() =>
  import("./pages/PortalGuard").then((m) => ({ default: m.PortalGuard }))
);
const Invite = lazy(() => import("./pages/Invite"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CheckInHistory = lazy(() => import("./pages/CheckInHistory"));

const MySop = lazy(() => import("./pages/MySop"));
const MyQa = lazy(() => import("./pages/MyQa"));
const NotFound = lazy(() => import("./pages/NotFound"));

// 游客版（免登录）
const PublicLayout = lazy(() =>
  import("./components/layout/PublicLayout").then((m) => ({ default: m.PublicLayout }))
);
const PublicScan = lazy(() => import("./pages/public/PublicScan"));
const PublicResult = lazy(() => import("./pages/public/PublicResult"));
const PublicCommunity = lazy(() => import("./pages/public/PublicCommunity"));
const PublicAbout = lazy(() => import("./pages/public/PublicAbout"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PermissionsProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Tabbed pages with bottom navigation */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<Navigate to="/scan" replace />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="/library" element={<OfficialLibrary />} />
                <Route path="/my-library" element={<MyLibrary />} />
                <Route path="/community" element={<Community />} />
                <Route path="/me" element={<Me />} />
              </Route>

              {/* Standalone pages without bottom tab */}
              <Route path="/library/:id" element={<OfficialDetail />} />
              <Route path="/history" element={<History />} />
              <Route
                path="/portal"
                element={
                  <PortalGuard>
                    <Portal />
                  </PortalGuard>
                }
              />
              <Route path="/admin/users" element={<Navigate to="/portal" replace />} />
              <Route path="/invite/:code" element={<Invite />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/me/check-ins" element={<CheckInHistory />} />
              
              <Route path="/me/sop" element={<MySop />} />
              <Route path="/me/qa" element={<MyQa />} />

              {/* 游客版（免登录） */}
              <Route path="/u" element={<PublicLayout />}>
                <Route index element={<PublicScan />} />
                <Route path="result" element={<PublicResult />} />
                <Route path="community" element={<PublicCommunity />} />
                <Route path="about" element={<PublicAbout />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

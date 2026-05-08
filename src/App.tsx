import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
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
const NotFound = lazy(() => import("./pages/NotFound"));

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

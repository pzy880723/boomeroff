import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";

const Scan = lazy(() => import("./pages/Scan"));
const OfficialLibrary = lazy(() => import("./pages/OfficialLibrary"));
const OfficialDetail = lazy(() => import("./pages/OfficialDetail"));
const MyLibrary = lazy(() => import("./pages/MyLibrary"));
const Community = lazy(() => import("./pages/Community"));
const Me = lazy(() => import("./pages/Me"));
const History = lazy(() => import("./pages/History"));
const Portal = lazy(() => import("./pages/Portal"));
const PortalGuard = lazy(() => import("./pages/PortalGuard").then(m => ({ default: m.PortalGuard })));
const Invite = lazy(() => import("./pages/Invite"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CheckInHistory = lazy(() => import("./pages/CheckInHistory"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
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
              <Route path="/portal" element={<PortalGuard><Portal /></PortalGuard>} />
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

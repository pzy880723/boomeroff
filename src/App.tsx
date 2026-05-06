import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { MainLayout } from "@/components/layout/MainLayout";
import Scan from "./pages/Scan";
import OfficialLibrary from "./pages/OfficialLibrary";
import OfficialDetail from "./pages/OfficialDetail";
import MyLibrary from "./pages/MyLibrary";
import Community from "./pages/Community";
import Me from "./pages/Me";
import History from "./pages/History";
import Portal from "./pages/Portal";
import { PortalGuard } from "./pages/PortalGuard";
import Invite from "./pages/Invite";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

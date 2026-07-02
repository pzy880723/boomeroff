import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PermissionsProvider } from "@/hooks/usePermissions";
import { MainLayout } from "@/components/layout/MainLayout";
import { Loader2 } from "lucide-react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import Scan from "./pages/Scan";
import { useEffect } from "react";
import { loadPublicBaseUrl } from "@/lib/publicBaseUrl";

// 非首屏路由全部懒加载，减小首包体积
const OfficialLibrary = lazy(() => import("./pages/OfficialLibrary"));
const OfficialDetail = lazy(() => import("./pages/OfficialDetail"));
const MyLibrary = lazy(() => import("./pages/MyLibrary"));
const Community = lazy(() => import("./pages/Community"));
const Home = lazy(() => import("./pages/Home"));
const Notifications = lazy(() => import("./pages/Notifications"));
const MessagesConversation = lazy(() => import("./pages/MessagesConversation"));
const Me = lazy(() => import("./pages/Me"));
const History = lazy(() => import("./pages/History"));
const Portal = lazy(() => import("./pages/Portal"));
const PortalGuard = lazy(() =>
  import("./pages/PortalGuard").then((m) => ({ default: m.PortalGuard }))
);
const PortalLoadingLazy = lazy(() =>
  import("./pages/PortalGuard").then((m) => ({ default: m.PortalLoading }))
);
const Invite = lazy(() => import("./pages/Invite"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CheckInHistory = lazy(() => import("./pages/CheckInHistory"));
const OkrList = lazy(() => import("./pages/OkrList"));
const OkrDetail = lazy(() => import("./pages/OkrDetail"));

const MySop = lazy(() => import("./pages/MySop"));
const MyQa = lazy(() => import("./pages/MyQa"));
const NotFound = lazy(() => import("./pages/NotFound"));
const VouchersMine = lazy(() => import("./pages/VouchersMine"));
const VoucherRedeem = lazy(() => import("./pages/VoucherRedeem"));
const VoucherSharePoster = lazy(() => import("./pages/VoucherSharePoster"));
const VerifyCallback = lazy(() => import("./pages/VerifyCallback"));
// 公开（免登录）路由 —— 急加载,避免微信 X5 webview 拉二级 chunk 失败导致白屏/报错
import PublicClaim from "./pages/public/PublicClaim";
import PublicClaimByPhone from "./pages/public/PublicClaimByPhone";
import PublicActivity from "./pages/public/PublicActivity";
import { PublicLayout } from "./components/layout/PublicLayout";
import PublicScan from "./pages/public/PublicScan";
import PublicResult from "./pages/public/PublicResult";
import PublicCommunity from "./pages/public/PublicCommunity";
import PublicAbout from "./pages/public/PublicAbout";
import { PublicErrorBoundary } from "./components/system/PublicErrorBoundary";
import { ScrollRestoration } from "./components/system/ScrollRestoration";


const ActivitiesMine = lazy(() => import("./pages/ActivitiesMine"));
const ActivityDetail = lazy(() => import("./pages/ActivityDetail"));
const MyMarketing = lazy(() => import("./pages/MyMarketing"));
const AiImage = lazy(() => import("./pages/marketing/AiImage"));
const MarketingCopy = lazy(() => import("./pages/marketing/MarketingCopy"));
const MarketingVideo = lazy(() => import("./pages/marketing/MarketingVideo"));
const MarketingLibrary = lazy(() => import("./pages/marketing/MarketingLibrary"));
const DispatchHome = lazy(() => import("./pages/marketing/dispatch/DispatchHome"));
const DispatchWorkbench = lazy(() => import("./pages/marketing/dispatch/Workbench"));
const DispatchJobDetail = lazy(() => import("./pages/marketing/dispatch/JobDetail"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

const App = () => {
  useEffect(() => { void loadPublicBaseUrl(); }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PermissionsProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollRestoration />
          <Suspense fallback={<RouteFallback />}>

            <Routes>
              {/* Tabbed pages with bottom navigation */}
              <Route element={<MainLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="/library" element={<OfficialLibrary />} />
                <Route path="/my-library" element={<MyLibrary />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/community" element={<Community />} />
                <Route path="/me" element={<Me />} />
              </Route>

              {/* Standalone pages without bottom tab */}
              <Route path="/library/:id" element={<OfficialDetail />} />
              <Route path="/history" element={<History />} />
              <Route
                path="/portal"
                element={
                  <Suspense fallback={<PortalLoadingLazy />}>
                    <PortalGuard>
                      <Portal />
                    </PortalGuard>
                  </Suspense>
                }
              />
              <Route path="/admin/users" element={<Navigate to="/portal" replace />} />
              <Route path="/invite/:code" element={<Invite />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/me/check-ins" element={<CheckInHistory />} />
              <Route path="/store/okr" element={<OkrList />} />
              <Route path="/store/okr/:id" element={<OkrDetail />} />
              
              
              <Route path="/me/sop" element={<MySop />} />
              <Route path="/me/qa" element={<MyQa />} />
              <Route path="/me/vouchers" element={<VouchersMine />} />
              <Route path="/me/vouchers/redeem/:code" element={<VoucherRedeem />} />
              <Route path="/me/vouchers/share/:claimId" element={<VoucherSharePoster />} />
              <Route path="/me/activities" element={<ActivitiesMine />} />
              <Route path="/me/activities/:id" element={<ActivityDetail />} />
              <Route path="/me/marketing" element={<MyMarketing />} />
              <Route path="/me/marketing/photo" element={<AiImage />} />
              <Route path="/me/marketing/copy" element={<MarketingCopy />} />
              <Route path="/me/marketing/video" element={<MarketingVideo />} />
              <Route path="/me/marketing/library" element={<MarketingLibrary />} />
              <Route path="/me/marketing/dispatch" element={<DispatchHome />} />
              <Route path="/me/marketing/dispatch/workbench" element={<DispatchWorkbench />} />
              <Route path="/me/marketing/dispatch/job/:jobId" element={<DispatchJobDetail />} />
              {/* 旧路由兼容 */}
              <Route path="/me/marketing/social-accounts" element={<Navigate to="/me/marketing/dispatch?tab=accounts" replace />} />
              <Route path="/me/marketing/publish-history" element={<Navigate to="/me/marketing/dispatch?tab=history" replace />} />
              <Route path="/me/marketing/publish/:assetId" element={<Navigate to="/me/marketing/dispatch/workbench" replace />} />

              {/* 火山真人认证 H5 回跳页(免登录) */}
              <Route path="/verify-callback" element={<VerifyCallback />} />

              {/* 游客版（免登录）—— 用静默 ErrorBoundary,顾客永远不会看到错误卡片 */}
              <Route
                path="/q"
                element={<PublicErrorBoundary><PublicClaimByPhone /></PublicErrorBoundary>}
              />
              <Route
                path="/u/c/:short"
                element={<PublicErrorBoundary><PublicClaim /></PublicErrorBoundary>}
              />
              <Route
                path="/u/claim/:shareToken"
                element={<PublicErrorBoundary><PublicClaim /></PublicErrorBoundary>}
              />
              <Route
                path="/u/activity/:shareToken"
                element={<PublicErrorBoundary><PublicActivity /></PublicErrorBoundary>}
              />
              <Route
                path="/u"
                element={<PublicErrorBoundary><PublicLayout /></PublicErrorBoundary>}
              >
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
      </PermissionsProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;

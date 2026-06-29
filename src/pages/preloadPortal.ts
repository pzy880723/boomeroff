// 预加载后台路由 chunk，避免点"进入后台"后还要等下载
let started = false;
export function preloadPortal() {
  if (started) return;
  started = true;
  // 同时预热 Portal 页面与 Guard
  void import('./Portal');
  void import('./PortalGuard');
}

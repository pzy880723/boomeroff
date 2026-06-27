// 反代 SAU 扫码登录 SSE。前端拿 step/qr 显示二维码。
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PLATFORM_CODE, SAU_BASE, SAU_TOKEN } from "../_shared/sau.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") || "";
  const code = PLATFORM_CODE[platform];
  if (!code) {
    return new Response(JSON.stringify({ error: "unknown platform" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!SAU_BASE) {
    return new Response(JSON.stringify({ error: "SAU_WORKER_URL 未配置" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // 我们部署的 SAU worker(aigc.boomeroff.top)实际只暴露 /login?type=N,其它命名保留兜底
  const candidates = [
    `/login?type=${code}`,
    `/login_qrcode?type=${code}`,
    `/loginQrcode?type=${code}`,
    `/account/login?type=${code}`,
    `/qrcode?type=${code}`,
  ];
  const baseHeaders: Record<string, string> = { Accept: "text/event-stream" };
  if (SAU_TOKEN) baseHeaders["X-Sau-Token"] = SAU_TOKEN;
  let upstream: Response | null = null;
  let lastStatus = 0;
  const tried: string[] = [];
  for (const path of candidates) {
    try {
      const r = await fetch(`${SAU_BASE}${path}`, { headers: baseHeaders });
      tried.push(`${path}=${r.status}`);
      if (r.ok && r.body) { upstream = r; break; }
      lastStatus = r.status;
      try { await r.body?.cancel(); } catch { /* noop */ }
    } catch (e) {
      tried.push(`${path}=ERR`);
    }
  }
  if (!upstream) {
    return new Response(JSON.stringify({
      error: `worker login ${lastStatus || 404}`,
      hint: "worker 未暴露扫码端点,请确认 SAU_WORKER_URL 指向已实现 /login_qrcode 的版本",
      tried,
    }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

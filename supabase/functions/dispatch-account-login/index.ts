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
  // SAU 的扫码端点(常见两种命名都尝试)
  const target = `${SAU_BASE}/login_qrcode?type=${code}`;
  const upstream = await fetch(target, {
    headers: SAU_TOKEN ? { "X-Sau-Token": SAU_TOKEN, "Accept": "text/event-stream" } : { "Accept": "text/event-stream" },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: `worker login ${upstream.status}` }), {
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

// 反代 SAU 扫码登录 SSE,把 worker 的 {status,image,message} 翻译成前端期望的 {step,qr,...}。
// worker(aigc.boomeroff.top)只暴露 /login?type=N。成功时不带 account_id,需要回调 /getValidAccounts 取最新一条。
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PLATFORM_CODE, SAU_BASE, SAU_TOKEN, sauListAccounts } from "../_shared/sau.ts";

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

  // 提前抓一次旧账号列表,用来在 success 时挑出"新增的那一条"
  let beforeIds = new Set<number>();
  try {
    const before = await sauListAccounts();
    beforeIds = new Set(before.filter(a => a.platform_code === code).map(a => a.worker_id));
  } catch { /* noop */ }

  const candidates = [
    `/login?type=${code}`,
    `/login_qrcode?type=${code}`,
    `/loginQrcode?type=${code}`,
    `/account/login?type=${code}`,
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
    } catch {
      tried.push(`${path}=ERR`);
    }
  }
  if (!upstream) {
    return new Response(JSON.stringify({
      error: `worker login ${lastStatus || 404}`,
      hint: "worker 未暴露扫码端点",
      tried,
    }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const reader = upstream!.body!.getReader();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() || "";
          for (const block of blocks) {
            const line = block.split("\n").find(l => l.startsWith("data:"));
            if (!line) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            let j: any = null;
            try { j = JSON.parse(raw); } catch { continue; }
            const status = j.status || j.type || j.step;
            if (status === "qrcode" || status === "qr") {
              send({ step: "qr", qr: j.image || j.qr });
            } else if (status === "scanned") {
              send({ step: "scanned" });
            } else if (status === "success") {
              // worker 没回 account_id,自己去抓
              let acct: any = null;
              try {
                const after = await sauListAccounts();
                const fresh = after.filter(a => a.platform_code === code && !beforeIds.has(a.worker_id));
                acct = fresh.sort((a, b) => b.worker_id - a.worker_id)[0]
                  || after.filter(a => a.platform_code === code).sort((a, b) => b.worker_id - a.worker_id)[0];
              } catch { /* noop */ }
              if (acct) {
                send({ step: "success", account_id: acct.worker_id, name: acct.name, avatar: acct.avatar });
              } else {
                send({ step: "fail", msg: "worker 未返回新增账号信息" });
              }
              break;
            } else if (status === "error" || status === "fail") {
              send({ step: "fail", msg: j.message || j.msg || "扫码失败" });
              break;
            }
          }
        }
      } catch (e) {
        try { send({ step: "fail", msg: String((e as Error).message || e) }); } catch { /* noop */ }
      } finally {
        try { controller.close(); } catch { /* noop */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

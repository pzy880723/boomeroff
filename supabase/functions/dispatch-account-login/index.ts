// 反代 SAU 扫码登录 SSE,把 worker 的 {status,image,message} 翻译成前端期望的 {step,qr,...}。
// worker(aigc.boomeroff.top)只暴露 /login?type=N。成功时通常不带 account_id,需要回调 /getValidAccounts 取最新一条并由后端落库。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PLATFORM_CODE, SAU_BASE, SAU_TOKEN, sauListAccounts } from "../_shared/sau.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") || "";
  const shopId = url.searchParams.get("shop_id") || "";
  const code = PLATFORM_CODE[platform];
  if (!code) {
    return new Response(JSON.stringify({ error: "unknown platform" }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (!shopId) {
    return new Response(JSON.stringify({ error: "缺少门店信息,请刷新页面后重试" }), {
      status: 400, headers: jsonHeaders,
    });
  }
  if (!SAU_BASE) {
    return new Response(JSON.stringify({ error: "SAU_WORKER_URL 未配置" }), {
      status: 500, headers: jsonHeaders,
    });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "请先登录后再绑定账号" }), {
      status: 401, headers: jsonHeaders,
    });
  }

  const supaUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) {
    return new Response(JSON.stringify({ error: "登录状态已失效,请重新登录" }), {
      status: 401, headers: jsonHeaders,
    });
  }

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (roleRow?.role !== "admin") {
    const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
    if (sp?.shop_id !== shopId) {
      return new Response(JSON.stringify({ error: "你没有这个门店的账号绑定权限" }), {
        status: 403, headers: jsonHeaders,
      });
    }
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
      error: `发布服务器登录接口异常(${lastStatus || 404})`,
      hint: "发布服务器未开放扫码端点",
      tried,
    }), {
      status: 502, headers: jsonHeaders,
    });
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const reader = upstream!.body!.getReader();
      let buf = "";
      let sawQr = false;
      let finished = false;
      try {
        send({ step: "connecting", msg: "正在连接发布服务器" });
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (!finished) {
              send({ step: "fail", msg: sawQr ? "发布服务器连接已断开,请重新扫码" : "发布服务器没有返回二维码,请稍后重试" });
            }
            break;
          }
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
              const qr = j.image || j.qr || j.url;
              if (qr) {
                sawQr = true;
                send({ step: "qr", qr, msg: "二维码已生成" });
              }
            } else if (status === "scanned" || status === "scan" || status === "confirmed" || status === "confirm") {
              send({ step: status === "scanned" || status === "scan" ? "scanned" : "syncing", msg: j.message || j.msg });
            } else if (status === "success" || status === "succeeded" || status === "done") {
              send({ step: "syncing", msg: "手机端已确认,正在同步账号" });
              let acct = normalizeWorkerAccount(j, code);
              if (!acct) acct = await findAccountAfterLogin(code, beforeIds);
              if (acct) {
                const { error } = await supa.from("social_accounts").upsert({
                  shop_id: shopId,
                  platform,
                  worker_account_id: acct.worker_id,
                  worker_account_key: `${platform}:${acct.worker_id}`,
                  account_name: acct.name || null,
                  avatar_url: acct.avatar || null,
                  cookie_status: acct.status === 0 ? "expired" : "active",
                  created_by: userId,
                  last_check_at: new Date().toISOString(),
                  meta: { worker_platform_code: acct.platform_code, source: "sau_worker" },
                }, { onConflict: "shop_id,platform,worker_account_key" });
                if (error) {
                  finished = true;
                  send({ step: "fail", msg: `账号已登录,但写入素材系统失败:${error.message}` });
                } else {
                  finished = true;
                  send({ step: "success", account_id: acct.worker_id, name: acct.name, avatar: acct.avatar });
                }
              } else {
                finished = true;
                send({ step: "fail", msg: "手机端可能已确认,但发布服务器没有写入账号信息。请重新扫码;如果仍失败,需要检查发布服务器是否成功保存登录凭证。" });
              }
              break;
            } else if (status === "error" || status === "fail") {
              finished = true;
              send({ step: "fail", msg: j.message || j.msg || "扫码失败" });
              break;
            } else if (j.message || j.msg) {
              send({ step: sawQr ? "scanned" : "connecting", msg: j.message || j.msg });
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

function normalizeWorkerAccount(raw: any, platformCode: number) {
  const workerId = Number(raw.account_id ?? raw.accountId ?? raw.id ?? raw.worker_id ?? raw.workerId);
  if (!Number.isFinite(workerId) || workerId <= 0) return null;
  return {
    worker_id: workerId,
    platform_code: Number(raw.platform_code ?? raw.type ?? platformCode),
    name: String(raw.name ?? raw.account_name ?? raw.nickname ?? ""),
    avatar: String(raw.avatar ?? raw.avatar_url ?? ""),
    status: Number(raw.status_code ?? raw.cookie_status ?? 1),
  };
}

async function findAccountAfterLogin(platformCode: number, beforeIds: Set<number>) {
  for (let i = 0; i < 8; i += 1) {
    try {
      const after = await sauListAccounts();
      const samePlatform = after.filter(a => a.platform_code === platformCode);
      const fresh = samePlatform.filter(a => !beforeIds.has(a.worker_id));
      const acct = fresh.sort((a, b) => b.worker_id - a.worker_id)[0]
        || samePlatform.sort((a, b) => b.worker_id - a.worker_id)[0];
      if (acct) return acct;
    } catch { /* worker list may be temporarily unavailable */ }
    await sleep(1200);
  }
  return null;
}

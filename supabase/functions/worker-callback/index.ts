// worker-callback:
// 腾讯 Worker 回调统一入口。签名协议：
//   X-Worker-Timestamp: Unix 秒
//   X-Worker-Signature: hex(HMAC-SHA256(COMPOSE_WORKER_TOKEN, `${timestamp}.${rawBody}`))
// 时间偏差 > 300s 或签名错误 → 401。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-timestamp, x-worker-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function hex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}

function pick<T = any>(payload: any, data: any, key: string): T | undefined {
  if (payload && payload[key] !== undefined) return payload[key];
  if (data && data[key] !== undefined) return data[key];
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TOKEN = Deno.env.get("COMPOSE_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COMPOSE_WORKER_TOKEN 未配置" }, 500);

    const ts = req.headers.get("x-worker-timestamp") || "";
    const sig = req.headers.get("x-worker-signature") || "";
    const rawBody = await req.text();

    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
      return json({ ok: false, error: "时间戳过期或无效" }, 401);
    }
    const expect = await hmacSha256Hex(TOKEN, `${ts}.${rawBody}`);
    if (!sig || !timingSafeEqual(sig.toLowerCase(), expect.toLowerCase())) {
      return json({ ok: false, error: "签名错误" }, 401);
    }

    let body: any;
    try { body = JSON.parse(rawBody || "{}"); }
    catch { return json({ ok: false, error: "invalid_json" }, 400); }

    const event: string = String(body.event || body.type || "").trim();
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const payload = body;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();

    // ==================== target.* ====================
    const targetId = pick<string>(payload, data, "target_id");
    const claimToken = pick<string>(payload, data, "claim_token");

    async function loadTarget(id: string) {
      const { data: t } = await admin.from("social_publish_targets").select("*").eq("id", id).maybeSingle();
      return t;
    }

    if (event === "target.progress") {
      if (!targetId) return json({ ok: false, error: "缺少 target_id" }, 400);
      const t = await loadTarget(targetId);
      if (!t) return json({ ok: false, error: "target 不存在" }, 404);
      if (claimToken && t.claim_token && claimToken !== t.claim_token) {
        return json({ ok: false, error: "claim_token 不匹配" }, 409);
      }
      const progress = Number(pick(payload, data, "progress") ?? t.progress ?? 0);
      const lastStep = pick<string>(payload, data, "last_step") ?? t.last_step ?? null;
      await admin.from("social_publish_targets").update({
        status: "running",
        progress: Math.max(0, Math.min(100, Math.floor(progress))),
        last_step: lastStep,
        updated_at: nowIso,
      }).eq("id", targetId);
      return json({ ok: true });
    }

    if (event === "target.success") {
      if (!targetId) return json({ ok: false, error: "缺少 target_id" }, 400);
      const t = await loadTarget(targetId);
      if (!t) return json({ ok: false, error: "target 不存在" }, 404);
      if (claimToken && t.claim_token && claimToken !== t.claim_token) {
        return json({ ok: false, error: "claim_token 不匹配" }, 409);
      }
      const platformPostId = pick<string>(payload, data, "platform_post_id") ?? null;
      const platformPostUrl = pick<string>(payload, data, "platform_post_url") ?? null;
      const platformUrl = pick<string>(payload, data, "platform_url") ?? platformPostUrl;
      await admin.from("social_publish_targets").update({
        status: "success",
        progress: 100,
        platform_post_id: platformPostId,
        platform_post_url: platformPostUrl,
        platform_url: platformUrl,
        finished_at: nowIso,
        error_message: null,
        last_step: "worker_success",
        claim_token: null,
        claim_expires_at: null,
        updated_at: nowIso,
      }).eq("id", targetId);
      // 汇总父 job 状态
      await rollupJobStatus(admin, t.job_id, nowIso);
      return json({ ok: true });
    }

    if (event === "target.failed") {
      if (!targetId) return json({ ok: false, error: "缺少 target_id" }, 400);
      const t = await loadTarget(targetId);
      if (!t) return json({ ok: false, error: "target 不存在" }, 404);
      if (claimToken && t.claim_token && claimToken !== t.claim_token) {
        return json({ ok: false, error: "claim_token 不匹配" }, 409);
      }
      const errorMessage = String(pick(payload, data, "error_message") ?? pick(payload, data, "error") ?? "worker_failed");
      const retryAfter = Number(pick(payload, data, "retry_after_seconds") ?? 0);
      const canRetry = retryAfter > 0 && (t.retry_count ?? 0) < 3;
      if (canRetry) {
        await admin.from("social_publish_targets").update({
          status: "pending",
          retry_count: (t.retry_count ?? 0) + 1,
          last_retry_at: nowIso,
          claim_token: null,
          claim_expires_at: null,
          worker_task_id: null,
          error_message: errorMessage,
          last_step: "worker_retry_scheduled",
          updated_at: nowIso,
        }).eq("id", targetId);
      } else {
        await admin.from("social_publish_targets").update({
          status: "failed",
          error_message: errorMessage,
          finished_at: nowIso,
          last_step: "worker_failed",
          claim_token: null,
          claim_expires_at: null,
          updated_at: nowIso,
        }).eq("id", targetId);
        await rollupJobStatus(admin, t.job_id, nowIso);
      }
      return json({ ok: true, retried: canRetry });
    }

    if (event === "target.cancelled") {
      if (!targetId) return json({ ok: false, error: "缺少 target_id" }, 400);
      const t = await loadTarget(targetId);
      if (!t) return json({ ok: false, error: "target 不存在" }, 404);
      await admin.from("social_publish_targets").update({
        status: "cancelled",
        finished_at: nowIso,
        last_step: "worker_cancelled",
        error_message: String(pick(payload, data, "reason") ?? "worker_cancelled"),
        claim_token: null,
        claim_expires_at: null,
        updated_at: nowIso,
      }).eq("id", targetId);
      await rollupJobStatus(admin, t.job_id, nowIso);
      return json({ ok: true });
    }

    // ==================== account.* ====================
    const accountId = pick<string>(payload, data, "account_id");

    if (event === "account.bound") {
      if (!accountId) return json({ ok: false, error: "缺少 account_id" }, 400);
      const workerAccountId = pick(payload, data, "worker_account_id");
      const accountName = pick<string>(payload, data, "account_name");
      const avatarUrl = pick<string>(payload, data, "avatar_url");
      const upd: any = { cookie_status: "active", last_check_at: nowIso, updated_at: nowIso };
      if (workerAccountId !== undefined && workerAccountId !== null) upd.worker_account_id = Number(workerAccountId);
      if (accountName) upd.account_name = accountName;
      if (avatarUrl) upd.avatar_url = avatarUrl;
      await admin.from("social_accounts").update(upd).eq("id", accountId);
      return json({ ok: true });
    }

    if (event === "account.cookie_expired") {
      if (!accountId) return json({ ok: false, error: "缺少 account_id" }, 400);
      await admin.from("social_accounts").update({
        cookie_status: "expired",
        last_check_at: nowIso,
        updated_at: nowIso,
      }).eq("id", accountId);
      return json({ ok: true });
    }

    if (event === "account.checked") {
      if (!accountId) return json({ ok: false, error: "缺少 account_id" }, 400);
      const status = String(pick(payload, data, "cookie_status") ?? "active");
      await admin.from("social_accounts").update({
        cookie_status: status,
        last_check_at: nowIso,
        updated_at: nowIso,
      }).eq("id", accountId);
      return json({ ok: true });
    }

    // ==================== log ====================
    if (event === "log") {
      const level = String(pick(payload, data, "level") ?? "info");
      const msg = String(pick(payload, data, "message") ?? "");
      console.log(`[worker-log][${level}] ${msg}`, pick(payload, data, "extra") ?? "");
      return json({ ok: true });
    }

    return json({ ok: false, error: `unknown_event: ${event}` }, 400);
  } catch (e) {
    console.error("[worker-callback] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

async function rollupJobStatus(admin: any, jobId: string, nowIso: string) {
  if (!jobId) return;
  const { data: targets } = await admin.from("social_publish_targets")
    .select("status").eq("job_id", jobId);
  if (!targets || targets.length === 0) return;
  const statuses = targets.map((t: any) => t.status);
  const pending = statuses.filter((s: string) => ["pending", "queued", "scheduled", "claimed", "running"].includes(s)).length;
  if (pending > 0) return; // 还有在跑
  const succ = statuses.filter((s: string) => s === "success").length;
  const failed = statuses.filter((s: string) => s === "failed").length;
  const cancelled = statuses.filter((s: string) => s === "cancelled").length;
  let jobStatus = "failed";
  if (succ === statuses.length) jobStatus = "done";
  else if (succ > 0 && (failed > 0 || cancelled > 0)) jobStatus = "partial";
  else if (cancelled === statuses.length) jobStatus = "cancelled";
  await admin.from("social_publish_jobs").update({ status: jobStatus, updated_at: nowIso }).eq("id", jobId);
}

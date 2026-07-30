// worker-cron-tick:
// 外部发布 Worker 用 Authorization: Bearer <COMPOSE_WORKER_TOKEN> 拉一批 pending 的
// social_publish_targets。原子改为 claimed 并返回完整发布包(账号 + 素材 + 每平台文案)。
// 同时把 claimed 且 claim_expires_at 已过期的 target 回退为 pending，防止僵死。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isHealthyCookieStatus } from "../_shared/sau.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function uniqStrings(arr: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TOKEN = Deno.env.get("COMPOSE_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COMPOSE_WORKER_TOKEN 未配置" }, 500);

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    const provided = m ? m[1].trim() : "";
    if (!provided || !timingSafeEqual(provided, TOKEN)) {
      return json({ ok: false, error: "未授权" }, 401);
    }

    const body = await req.json().catch(() => ({} as any));
    const workerId: string = typeof body.worker_id === "string" && body.worker_id ? body.worker_id : "unknown-worker";
    const rawBatch = Number(body.max_batch);
    const maxBatch = Number.isFinite(rawBatch) ? Math.max(1, Math.min(50, Math.floor(rawBatch))) : 5;
    const platforms: string[] | null = Array.isArray(body.platforms) && body.platforms.length
      ? uniqStrings(body.platforms)
      : null;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();

    // 0. 到点定时任务入队: scheduled → queued/pending
    {
      const { data: dueJobs } = await admin.from("social_publish_jobs")
        .select("id")
        .eq("status", "scheduled")
        .lte("schedule_at", nowIso)
        .order("schedule_at", { ascending: true })
        .limit(20);
      const dueJobIds = uniqStrings((dueJobs || []).map((j: any) => j.id));
      if (dueJobIds.length) {
        await admin.from("social_publish_jobs")
          .update({ status: "queued", updated_at: nowIso })
          .in("id", dueJobIds)
          .eq("status", "scheduled");
        await admin.from("social_publish_targets")
          .update({ status: "pending", progress: 0, error_message: null, last_step: "scheduled_queued", updated_at: nowIso })
          .in("job_id", dueJobIds)
          .eq("status", "scheduled");
      }
    }

    // 1. 回收过期 claim
    await admin.from("social_publish_targets")
      .update({ status: "pending", claim_token: null, claim_expires_at: null, worker_task_id: null })
      .eq("status", "claimed")
      .lt("claim_expires_at", nowIso);

    // 2. 拉候选 pending targets(多拉一些以便过滤)
    let q = admin.from("social_publish_targets")
      .select("id, job_id, platform, account_id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(Math.max(maxBatch * 4, 20));
    if (platforms && platforms.length) q = q.in("platform", platforms);
    const { data: candidates, error: candErr } = await q;
    if (candErr) return json({ ok: false, error: candErr.message }, 500);
    if (!candidates || candidates.length === 0) return json({ ok: true, targets: [] });

    // 3. 拉父 job 过滤 cancelled/failed 或未到期定时
    const jobIds = uniqStrings(candidates.map((c: any) => c.job_id));
    const { data: jobs } = await admin.from("social_publish_jobs")
      .select("*").in("id", jobIds);
    const jobMap = new Map<string, any>((jobs || []).map((j: any) => [j.id, j]));

    // 3.1 账号 cookie 健康状态:失效账号的 target 直接判 failed,不能发给 Worker,也不能永久 pending。
    const candAccountIds = uniqStrings(candidates.map((c: any) => c.account_id));
    const healthMap = new Map<string, boolean>();
    if (candAccountIds.length) {
      const { data: candAccounts } = await admin.from("social_accounts")
        .select("id, cookie_status").in("id", candAccountIds);
      for (const a of candAccounts || []) healthMap.set(a.id, isHealthyCookieStatus(a.cookie_status));
    }

    const eligible: any[] = [];
    const invalidIds: string[] = [];
    const invalidJobIds = new Set<string>();
    for (const c of candidates) {
      const job = jobMap.get(c.job_id);
      if (!job) continue;
      if (job.status === "cancelled" || job.status === "failed") continue;
      if (job.schedule_at && new Date(job.schedule_at).getTime() > Date.now()) continue;
      if (!healthMap.get(c.account_id)) {
        invalidIds.push(c.id);
        invalidJobIds.add(c.job_id);
        continue;
      }
      eligible.push(c);
      if (eligible.length >= maxBatch) break;
    }

    if (invalidIds.length) {
      await admin.from("social_publish_targets")
        .update({
          status: "failed",
          error_message: "account_cookie_invalid",
          last_step: "account_cookie_invalid",
          finished_at: nowIso,
          claim_token: null,
          claim_expires_at: null,
          updated_at: nowIso,
        })
        .in("id", invalidIds)
        .eq("status", "pending");
      for (const jid of invalidJobIds) await rollupJobStatus(admin, jid, nowIso);
    }

    if (eligible.length === 0) return json({ ok: true, targets: [], skipped_invalid_accounts: invalidIds.length });

    // 4. 原子 CAS: pending → claimed
    const claimToken = randomToken();
    const claimExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const workerTaskId = `${workerId}:${claimToken}`;
    const ids = eligible.map((e: any) => e.id);
    const { data: claimed, error: claimErr } = await admin.from("social_publish_targets")
      .update({
        status: "claimed",
        claim_token: claimToken,
        claim_expires_at: claimExpiresAt,
        worker_task_id: workerTaskId,
        started_at: nowIso,
        last_step: "worker_claimed",
        error_message: null,
        updated_at: nowIso,
      })
      .in("id", ids)
      .eq("status", "pending")
      .select("*");
    if (claimErr) return json({ ok: false, error: claimErr.message }, 500);
    if (!claimed || claimed.length === 0) return json({ ok: true, targets: [] });

    // 5. 相关 job → running
    const claimedJobIds = uniqStrings(claimed.map((t: any) => t.job_id));
    if (claimedJobIds.length) {
      await admin.from("social_publish_jobs")
        .update({ status: "running", updated_at: nowIso })
        .in("id", claimedJobIds)
        .eq("status", "queued");
    }

    // 6. 拉账号 + 素材
    const accountIds = uniqStrings(claimed.map((t: any) => t.account_id));
    const { data: accounts } = await admin.from("social_accounts")
      .select("id, shop_id, platform, account_name, avatar_url, worker_account_id, worker_account_key, cookie_status, content_kinds, capabilities, meta")
      .in("id", accountIds);
    const accountMap = new Map<string, any>((accounts || []).map((a: any) => [a.id, a]));

    // 收集所有 per_platform.asset_ids 里出现的素材 id
    const extraAssetIds = new Set<string>();
    for (const t of claimed) {
      const job = jobMap.get(t.job_id);
      const perPlat = (job?.per_platform || {})[t.platform] || {};
      for (const id of (Array.isArray(perPlat.asset_ids) ? perPlat.asset_ids : [])) {
        if (typeof id === "string" && id) extraAssetIds.add(id);
      }
    }
    let assetMap = new Map<string, any>();
    if (extraAssetIds.size) {
      const { data: assets } = await admin.from("marketing_assets")
        .select("id, output_url, kind").in("id", Array.from(extraAssetIds));
      assetMap = new Map((assets || []).map((a: any) => [a.id, a]));
    }

    // 7. 组装返回
    const targets = claimed.map((t: any) => {
      const job = jobMap.get(t.job_id) || {};
      const account = accountMap.get(t.account_id) || null;
      const perPlat = (job.per_platform || {})[t.platform] || {};
      const perPlatAssetIds: string[] = Array.isArray(perPlat.asset_ids) ? perPlat.asset_ids : [];

      const assetUrls = uniqStrings([
        ...perPlatAssetIds.map((id) => assetMap.get(id)?.output_url).filter(Boolean),
        job.media_url,
        ...(Array.isArray(job.images) ? job.images : []),
      ]);

      return {
        target_id: t.id,
        claim_token: claimToken,
        claim_expires_at: claimExpiresAt,
        worker_task_id: workerTaskId,
        job_id: t.job_id,
        platform: t.platform,
        kind: job.kind || null,
        title: perPlat.title ?? job.title ?? null,
        body: perPlat.body ?? job.body ?? null,
        tags: Array.isArray(perPlat.tags) && perPlat.tags.length
          ? perPlat.tags
          : (Array.isArray(job.tags) ? job.tags : []),
        schedule_at: job.schedule_at || null,
        cover_url: perPlat.cover_url ?? job.cover_url ?? null,
        asset_urls: assetUrls,
        account: account ? {
          id: account.id,
          shop_id: account.shop_id,
          platform: account.platform,
          account_name: account.account_name,
          avatar_url: account.avatar_url,
          worker_account_id: account.worker_account_id,
          worker_account_key: account.worker_account_key,
          cookie_status: account.cookie_status,
          content_kinds: account.content_kinds || [],
          capabilities: account.capabilities || {},
          meta: account.meta || {},
        } : null,
        per_platform: perPlat,
        automation_task_id: perPlat.automation_task_id
          ?? (job.meta && typeof job.meta === "object" ? (job.meta as any).automation_task_id : null)
          ?? null,
      };
    });

    return json({ ok: true, count: targets.length, targets });
  } catch (e) {
    console.error("[worker-cron-tick] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

// 与 worker-callback 保持同一套父 job 汇总规则。
async function rollupJobStatus(admin: any, jobId: string, nowIso: string) {
  if (!jobId) return;
  const { data: targets } = await admin.from("social_publish_targets")
    .select("status").eq("job_id", jobId);
  if (!targets || targets.length === 0) return;
  const statuses = targets.map((t: any) => t.status);
  const pending = statuses.filter((s: string) => ["pending", "queued", "scheduled", "claimed", "running"].includes(s)).length;
  if (pending > 0) return;
  const succ = statuses.filter((s: string) => s === "success").length;
  const failed = statuses.filter((s: string) => s === "failed").length;
  const cancelled = statuses.filter((s: string) => s === "cancelled").length;
  let jobStatus = "failed";
  if (succ === statuses.length) jobStatus = "done";
  else if (succ > 0 && (failed > 0 || cancelled > 0)) jobStatus = "partial";
  else if (cancelled === statuses.length) jobStatus = "cancelled";
  await admin.from("social_publish_jobs").update({ status: jobStatus, updated_at: nowIso }).eq("id", jobId);
}

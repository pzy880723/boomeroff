// automation-tick:
// 1) 已登录用户 POST {"force_task_id":"uuid"} —— 立即执行某个自动发布任务
// 2) 腾讯云定时器 X-Worker-Token / Authorization: Bearer <WORKER_SHARED_SECRET|COMPOSE_WORKER_TOKEN>
//    —— 扫描所有到期且 enabled 的任务
// 严禁匿名放行:必须是合法用户 JWT 或 Worker secret。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...headers, "Content-Type": "application/json" } });

function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 健康账号口径:cookie_status 必须是 active 或 valid(生产真实数据用的是 active),
// 且有 worker 账号标识。expired/invalid 等一律不可发布。
const HEALTHY_COOKIE_STATUS = ["active", "valid"];
const PUBLISHABLE = (a: any) =>
  a && HEALTHY_COOKIE_STATUS.includes(String(a.cookie_status || "")) &&
  (a.worker_account_id || a.worker_account_key);

// 严格 ERP 判定:app_metadata.auth_source='erp' → erp_user_links canonical → deterministic email 兜底。
// 不做域名泛匹配,普通 BOOMER GO 用户一律 false。
async function isErpUserId(supa: any, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: authUser } = await supa.auth.admin.getUserById(userId);
    const meta = (authUser?.user?.app_metadata || {}) as any;
    if (meta.auth_source === "erp") return true;
    const { data: link } = await supa
      .from("erp_user_links").select("aigc_user_id").eq("aigc_user_id", userId).maybeSingle();
    if (link) return true;
    const email = String(authUser?.user?.email || "").toLowerCase();
    const m = email.match(/^erp\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@aigc\.boomeroff\.local$/);
    if (m?.[1]) {
      const { data: canonical } = await supa
        .from("erp_user_links").select("aigc_user_id").eq("erp_user_id", m[1]).maybeSingle();
      return Boolean(canonical?.aigc_user_id);
    }
  } catch { /* keep strict */ }
  return false;
}

function resolveDraft(asset: any, task: any) {
  const meta = asset?.meta || {};
  const copy = meta.video_copy || meta.publish_copy || {};
  const title = String(copy.title || copy.cover_title || meta.title || meta.summary || asset?.category || "BOOMER·OFF 新片上线").slice(0, 60);
  const body = String(copy.body || copy.caption || asset?.output_text || title);
  const rawTags = Array.isArray(copy.hashtags) ? copy.hashtags : Array.isArray(asset?.tags) ? asset.tags : [];
  const tags = rawTags.map((t: string) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 8);
  const cfgTags = Array.isArray(task?.config?.extra_tags) ? task.config.extra_tags : [];
  return { title, body, tags: Array.from(new Set([...tags, ...cfgTags])) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WORKER_SECRET = Deno.env.get("WORKER_SHARED_SECRET") || Deno.env.get("COMPOSE_WORKER_TOKEN") || "";

  try {
    const authHeader = req.headers.get("authorization") || "";
    const bearer = (authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "").trim();
    const workerToken = (req.headers.get("x-worker-token") || "").trim();

    let isWorker = false;
    let userId: string | null = null;

    if (WORKER_SECRET && (timingSafeEqual(workerToken, WORKER_SECRET) || timingSafeEqual(bearer, WORKER_SECRET))) {
      isWorker = true;
    } else if (bearer) {
      const supaUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: claims } = await supaUser.auth.getClaims(bearer);
      userId = (claims?.claims?.sub as string) || null;
    }
    if (!isWorker && !userId) return json({ ok: false, error: "unauthorized" }, 401);

    const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({} as any));
    const forceTaskId: string | undefined = body.force_task_id;

    let tasks: any[] = [];
    if (forceTaskId) {
      const { data } = await supa.from("automation_tasks").select("*").eq("id", forceTaskId).maybeSingle();
      if (!data) return json({ ok: false, error: "task_not_found" }, 404);
      tasks = [data];
    } else {
      if (!isWorker) return json({ ok: false, error: "force_task_id_required" }, 400);
      const nowIso = new Date().toISOString();
      const { data } = await supa
        .from("automation_tasks")
        .select("*")
        .eq("enabled", true)
        .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
        .order("next_run_at", { ascending: true, nullsFirst: true })
        .limit(10);
      tasks = data || [];
    }

    const results: any[] = [];
    for (const task of tasks) {
      const r = await runTask(supa, task, userId);
      results.push({ id: task.id, ...r });
      const intervalMin = Number(task.interval_minutes) > 0 ? Number(task.interval_minutes) : 1440;
      await supa.from("automation_tasks").update({
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + intervalMin * 60_000).toISOString(),
        last_status: r.ok ? "success" : (r.error || "failed"),
        last_error: r.ok ? null : (r.error || null),
      }).eq("id", task.id);
    }

    return json({ ok: true, results });
  } catch (e) {
    console.error("[automation-tick] fatal", e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});

async function runTask(supa: any, task: any, actorId: string | null) {
  const platforms: string[] = Array.isArray(task.platforms) ? task.platforms.filter(Boolean) : [];

  // 1. 真实可用账号。ERP 协同用户 = 共享账号库,不按 task.shop_id 过滤;
  //    BOOMER GO 门店用户仍严格门店隔离。
  const erpShared = await isErpUserId(supa, task.created_by || null);

  let accQuery = supa.from("social_accounts").select("*").in("cookie_status", HEALTHY_COOKIE_STATUS);
  if (platforms.length) accQuery = accQuery.in("platform", platforms);
  if (!erpShared && task.shop_id) accQuery = accQuery.eq("shop_id", task.shop_id);
  const { data: accountsRaw } = await accQuery;
  const accounts = (accountsRaw || []).filter(PUBLISHABLE);
  if (!accounts.length) return { ok: false, error: "no_valid_accounts" };

  let scoped: any[];
  let shopId: string;
  if (erpShared) {
    // 每个平台取一个账号
    const byPlatform = new Map<string, any>();
    for (const a of accounts) if (!byPlatform.has(a.platform)) byPlatform.set(a.platform, a);
    scoped = [...byPlatform.values()];
    shopId = task.shop_id || scoped[0].shop_id;
  } else {
    shopId = task.shop_id || accounts[0].shop_id;
    scoped = accounts.filter((a: any) => a.shop_id === shopId);
  }
  if (!scoped.length) return { ok: false, error: "no_valid_accounts" };

  // 2. 真实可发布素材:已成片视频且尚未被发布任务使用过
  const filter = task.asset_filter || {};
  let assetQuery = supa
    .from("marketing_assets")
    .select("*")
    .eq("kind", filter.kind || "video")
    .not("output_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (filter.category) assetQuery = assetQuery.eq("category", filter.category);
  if (Array.isArray(filter.tags) && filter.tags.length) assetQuery = assetQuery.overlaps("tags", filter.tags);
  if (task.shop_id) assetQuery = assetQuery.eq("shop_id", task.shop_id);
  const { data: assetsRaw } = await assetQuery;
  const assets = assetsRaw || [];
  if (!assets.length) return { ok: false, error: "no_publishable_assets" };

  const { data: usedJobs } = await supa
    .from("social_publish_jobs")
    .select("asset_id")
    .in("asset_id", assets.map((a: any) => a.id));
  const used = new Set((usedJobs || []).map((r: any) => r.asset_id));
  const asset = assets.find((a: any) => !used.has(a.id));
  if (!asset) return { ok: false, error: "no_publishable_assets" };

  const draft = resolveDraft(asset, task);
  const { data: jobRow, error: jobErr } = await supa.from("social_publish_jobs").insert({
    shop_id: shopId,
    asset_id: asset.id,
    kind: "video",
    title: draft.title,
    body: draft.body,
    tags: draft.tags,
    cover_url: asset.meta?.poster_url || asset.meta?.cover_url || null,
    media_url: asset.output_url,
    per_platform: {},
    status: "queued",
    created_by: actorId || task.created_by || asset.user_id,
    automation_task_id: task.id,
  }).select("id").single();
  if (jobErr || !jobRow) return { ok: false, error: `create_job_failed: ${jobErr?.message || "unknown"}` };

  const targets = scoped.map((a: any) => ({
    job_id: jobRow.id,
    account_id: a.id,
    platform: a.platform,
    status: "pending",
    progress: 0,
  }));
  const { error: tErr } = await supa.from("social_publish_targets").insert(targets);
  if (tErr) {
    await supa.from("social_publish_jobs").delete().eq("id", jobRow.id);
    return { ok: false, error: `create_targets_failed: ${tErr.message}` };
  }

  return { ok: true, job_id: jobRow.id, targets: targets.length };
}

// 建分发任务:校验 specs → 建 jobs/targets → 交给腾讯云 Worker 异步执行。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PLATFORM_LABEL } from "../_shared/sau.ts";

interface PerPlatform {
  title?: string;
  body?: string;
  tags?: string[];
  category?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
    const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return j({ error: "unauthorized" }, 401);

    const body = await req.json();
    const assetId = body.asset_id as string | undefined;
    const images = (body.images || []) as string[];
    const kind = (body.kind || "video") as "video" | "image_text";
    const accountIds = (body.account_ids || []) as string[];
    const title = ((body.title || "") as string).trim();
    const description = ((body.body || "") as string).trim();
    const tags = (body.tags || []) as string[];
    const perPlatform = (body.per_platform || {}) as Record<string, PerPlatform>;
    const scheduleAtRaw = body.schedule_at as string | undefined;
    let scheduleAt: Date | null = null;
    if (scheduleAtRaw) {
      const d = new Date(scheduleAtRaw);
      if (!isNaN(d.getTime())) scheduleAt = d;
    }
    const isDelayed = scheduleAt && scheduleAt.getTime() > Date.now() + 30_000;

    if (accountIds.length === 0 || !title) return j({ error: "account_ids / title required" }, 400);
    if (kind === "video" && !assetId) return j({ error: "video kind requires asset_id" }, 400);
    if (kind === "image_text" && images.length === 0) return j({ error: "image_text kind requires images" }, 400);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 加载素材
    let mediaUrl: string | null = null;
    let coverUrl: string | null = null;
    let asset: any = null;
    if (kind === "video") {
      const { data } = await supa.from("marketing_assets").select("*").eq("id", assetId).maybeSingle();
      if (!data) return j({ error: "asset not found" }, 404);
      if (data.kind !== "video" || !data.output_url) return j({ error: "asset is not a published video" }, 400);
      asset = data;
      mediaUrl = data.output_url;
      coverUrl = data.meta?.poster_url || data.meta?.cover_url || null;
    }

    // 加载并验证账号
    const { data: accounts } = await supa.from("social_accounts").select("*").in("id", accountIds);
    if (!accounts || accounts.length !== accountIds.length) return j({ error: "some accounts not found" }, 400);
    const unavailableAccounts = accounts.filter((a) =>
      a.cookie_status === "expired" || !(a.worker_account_key || a.worker_account_id)
    );
    if (unavailableAccounts.length) {
      const names = unavailableAccounts.map((a) => a.account_name || a.platform).join("、");
      return j({ error: `账号未完成登录或登录已失效: ${names}` }, 400);
    }
    const shopId = accounts[0].shop_id;
    if (accounts.some((a) => a.shop_id !== shopId)) return j({ error: "accounts must belong to same shop" }, 400);

    // 权限
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin") {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== shopId) return j({ error: "forbidden" }, 403);
    }

    // 读 specs 做校验
    const { data: specsRows } = await supa.from("social_platform_specs").select("*").eq("enabled", true);
    const specsMap = new Map((specsRows || []).map((s: any) => [s.platform, s]));
    const platforms = Array.from(new Set(accounts.map((a) => a.platform)));
    const validateErrors: string[] = [];
    for (const p of platforms) {
      const spec: any = specsMap.get(p);
      if (!spec) { validateErrors.push(`${PLATFORM_LABEL[p] || p}: 未配置`); continue; }
      const pp = perPlatform[p] || {};
      const t = pp.title || title;
      if (t.length > spec.title_max) validateErrors.push(`${spec.label}标题超过 ${spec.title_max} 字`);
      if (kind === "video" && !spec.supports_video) validateErrors.push(`${spec.label}暂不支持视频`);
      if (isDelayed && !spec.supports_schedule) validateErrors.push(`${spec.label}暂不支持定时发布`);
      if (kind === "image_text") {
        if (!spec.supports_image_text) validateErrors.push(`${spec.label}暂不支持图文`);
        if (images.length < spec.images_min || images.length > spec.images_max)
          validateErrors.push(`${spec.label}图片数量需在 ${spec.images_min}-${spec.images_max} 张`);
      }
    }
    if (validateErrors.length) return j({ error: validateErrors.join("; ") }, 400);

    // 建 job
    const { data: jobRow, error: jobErr } = await supa.from("social_publish_jobs").insert({
      shop_id: shopId,
      asset_id: assetId || null,
      kind,
      title,
      body: description,
      tags,
      images,
      cover_url: coverUrl,
      media_url: mediaUrl,
      per_platform: perPlatform,
      schedule_at: scheduleAt?.toISOString() || null,
      status: isDelayed ? "scheduled" : "queued",
      created_by: userId,
      worker_file_path: null,
    }).select().single();
    if (jobErr || !jobRow) return j({ error: "建任务失败: " + jobErr?.message }, 500);

    const targets = accounts.map((a) => ({
      job_id: jobRow.id, account_id: a.id, platform: a.platform,
      status: isDelayed ? "scheduled" : "pending", progress: 0,
    }));
    const { error: targetsErr } = await supa.from("social_publish_targets").insert(targets);
    if (targetsErr) {
      await supa.from("social_publish_jobs").delete().eq("id", jobRow.id);
      return j({ error: "建发布目标失败: " + targetsErr.message }, 500);
    }

    if (isDelayed) {
      return j({ job_id: jobRow.id, scheduled: true, schedule_at: scheduleAt!.toISOString() });
    }

    return j({ job_id: jobRow.id, queued: true, status: "queued", target_count: targets.length });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

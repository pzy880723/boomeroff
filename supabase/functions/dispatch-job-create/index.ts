// 建分发任务:校验 specs → 上传素材到 worker → 建 jobs/targets → 立即派单或留给 cron。
// 视频走 /postVideoBatch;图文目前未实现,标记 failed 提示升级 worker。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauUpload, sauPostVideoBatch, sauPostImageBatch, PLATFORM_CODE, PLATFORM_LABEL } from "../_shared/sau.ts";

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
      if (kind === "image_text") {
        if (!spec.supports_image_text) validateErrors.push(`${spec.label}暂不支持图文`);
        if (images.length < spec.images_min || images.length > spec.images_max)
          validateErrors.push(`${spec.label}图片数量需在 ${spec.images_min}-${spec.images_max} 张`);
      }
    }
    if (validateErrors.length) return j({ error: validateErrors.join("; ") }, 400);

    // 视频:下载 + 上传到 worker(图文逐图)
    let workerFilePath: string | null = null;
    let workerImagePaths: string[] = [];
    if (!isDelayed) {
      try {
        if (kind === "video") {
          const r = await fetch(mediaUrl!);
          if (!r.ok) return j({ error: `视频下载失败 ${r.status}` }, 502);
          const blob = await r.blob();
          if (blob.size > 200 * 1024 * 1024) return j({ error: "视频超过 200MB" }, 400);
          const up = await sauUpload(blob, `boomer-${assetId!.slice(0, 8)}.mp4`);
          workerFilePath = up.path;
        } else {
          for (const url of images) {
            const r = await fetch(url);
            if (!r.ok) continue;
            const blob = await r.blob();
            const up = await sauUpload(blob, `boomer-img-${crypto.randomUUID().slice(0, 8)}.jpg`);
            workerImagePaths.push(up.path);
          }
          if (workerImagePaths.length === 0) return j({ error: "图片上传全部失败" }, 502);
        }
      } catch (e) {
        return j({ error: `上传到 worker 失败: ${e}` }, 502);
      }
    }

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
      status: isDelayed ? "scheduled" : "running",
      created_by: userId,
      worker_file_path: workerFilePath,
    }).select().single();
    if (jobErr || !jobRow) return j({ error: "建任务失败: " + jobErr?.message }, 500);

    const targets = accounts.map((a) => ({
      job_id: jobRow.id, account_id: a.id, platform: a.platform,
      status: isDelayed ? "scheduled" : "queued", progress: 0,
    }));
    await supa.from("social_publish_targets").insert(targets);

    if (isDelayed) {
      return j({ job_id: jobRow.id, scheduled: true, schedule_at: scheduleAt!.toISOString() });
    }

    // 立即分发(按平台分组)
    const errors: string[] = [];
    const byPlatform = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const arr = byPlatform.get(a.platform) || [];
      arr.push(a as any);
      byPlatform.set(a.platform, arr);
    }
    for (const [platform, accs] of byPlatform.entries()) {
      const ptype = PLATFORM_CODE[platform];
      const accIds = accs.map((a: any) => a.id);
      await supa.from("social_publish_targets").update({
        status: "running", started_at: new Date().toISOString(), last_step: "submitting",
      }).eq("job_id", jobRow.id).in("account_id", accIds);

      const pp = perPlatform[platform] || {};
      const pTitle = (pp.title || title).slice(0, 100);
      const pTags = pp.tags && pp.tags.length ? pp.tags : tags;
      const pCategory = pp.category;
      const workerAccs = accs.map((a: any) => a.worker_account_id).filter(Boolean);

      if (workerAccs.length === 0) {
        const msg = "账号未在 worker 注册,请重新扫码";
        errors.push(`${PLATFORM_LABEL[platform]}: ${msg}`);
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: msg, finished_at: new Date().toISOString(),
        }).eq("job_id", jobRow.id).in("account_id", accIds);
        continue;
      }

      let res;
      if (kind === "video") {
        res = await sauPostVideoBatch({
          filePath: workerFilePath!, accountIds: workerAccs, platformCode: ptype,
          title: pTitle, tags: pTags, category: pCategory,
        });
      } else {
        res = await sauPostImageBatch({
          filePaths: workerImagePaths, accountIds: workerAccs, platformCode: ptype,
          title: pTitle, tags: pTags, category: pCategory, body: pp.body || description,
        });
      }
      if (!res.ok) {
        errors.push(`${PLATFORM_LABEL[platform]}: ${res.error || "未知错误"}`);
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: res.error || "未知错误", finished_at: new Date().toISOString(),
        }).eq("job_id", jobRow.id).in("account_id", accIds);
      } else {
        await supa.from("social_publish_targets").update({
          status: "success", progress: 100, finished_at: new Date().toISOString(), last_step: "submitted",
        }).eq("job_id", jobRow.id).in("account_id", accIds);
      }
    }

    // finalize
    const { data: tgs } = await supa.from("social_publish_targets").select("status").eq("job_id", jobRow.id);
    const ok = (tgs || []).filter((t: any) => t.status === "success").length;
    const total = (tgs || []).length;
    const next = ok === total ? "done" : ok > 0 ? "partial" : "failed";
    await supa.from("social_publish_jobs").update({ status: next, updated_at: new Date().toISOString() }).eq("id", jobRow.id);

    return j({ job_id: jobRow.id, errors, status: next });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// 1) 校权 + 取 asset 2) 把视频字节从我们 Storage / 远端 URL 流到 worker /upload
// 3) 建父子任务 4) 按平台分组调 /postVideoBatch 5) 返回 job_id
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauFetch, PLATFORM_CODE, PLATFORM_LABEL } from "../_shared/sau.ts";

interface ScheduleConfig {
  enable: boolean;
  videos_per_day?: number;
  daily_times?: number[]; // 小时数组, 如 [9, 14, 20]
  start_days?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supaUser = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: claims } = await supaUser.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const assetId = body.asset_id as string;
    const accountIds = (body.account_ids || []) as string[];
    const title = ((body.title || "") as string).trim();
    const tags = (body.tags || []) as string[];
    const category = (body.category || "") as string;
    const description = ((body.description || "") as string).trim();
    const schedule: ScheduleConfig = body.schedule || { enable: false };

    if (!assetId || accountIds.length === 0 || !title) {
      return new Response(JSON.stringify({ error: "asset_id / account_ids / title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 取 asset
    const { data: asset, error: assetErr } = await supa.from("marketing_assets").select("*").eq("id", assetId).maybeSingle();
    if (assetErr || !asset) {
      return new Response(JSON.stringify({ error: "asset not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (asset.kind !== "video" || !asset.output_url) {
      return new Response(JSON.stringify({ error: "only published videos can be sent" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 取账号 & 校权
    const { data: accounts } = await supa.from("social_accounts").select("*").in("id", accountIds);
    if (!accounts || accounts.length !== accountIds.length) {
      return new Response(JSON.stringify({ error: "some accounts not found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const shopId = accounts[0].shop_id;
    if (accounts.some(a => a.shop_id !== shopId)) {
      return new Response(JSON.stringify({ error: "accounts must belong to same shop" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 权限: admin or 同店员工
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = roleRow?.role === "admin";
    if (!isAdmin) {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== shopId) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 下载视频字节
    const videoResp = await fetch(asset.output_url);
    if (!videoResp.ok) {
      return new Response(JSON.stringify({ error: `视频下载失败 ${videoResp.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const videoBlob = await videoResp.blob();
    if (videoBlob.size > 160 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "视频超过 160MB,worker 不支持" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileName = `boomer-${assetId.slice(0, 8)}.mp4`;

    // 上传到 worker
    const fd = new FormData();
    fd.append("file", videoBlob, fileName);
    const upResp = await sauFetch("/upload", { method: "POST", body: fd });
    if (!upResp.ok) {
      const t = await upResp.text();
      return new Response(JSON.stringify({ error: `worker /upload 失败 ${upResp.status}: ${t.slice(0, 200)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const upJson = await upResp.json();
    const workerFilePath = upJson?.data || upJson?.path || upJson?.file;
    if (!workerFilePath) {
      return new Response(JSON.stringify({ error: "worker /upload 返回缺少文件路径" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 建父任务
    const { data: jobRow, error: jobErr } = await supa.from("social_publish_jobs").insert({
      shop_id: shopId,
      asset_id: assetId,
      kind: "video",
      title,
      body: description,
      tags,
      cover_url: asset.meta?.poster_url || asset.meta?.cover_url || null,
      media_url: asset.output_url,
      per_platform: {},
      schedule_at: null,
      status: "running",
      created_by: userId,
      worker_file_path: workerFilePath,
    }).select().single();
    if (jobErr || !jobRow) {
      return new Response(JSON.stringify({ error: "建任务失败: " + jobErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jobId = jobRow.id;

    // 建子任务
    const targets = accounts.map(a => ({
      job_id: jobId,
      account_id: a.id,
      platform: a.platform,
      status: "queued",
      progress: 0,
    }));
    await supa.from("social_publish_targets").insert(targets);

    // 按平台分组调 /postVideoBatch
    const byPlatform = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const arr = byPlatform.get(a.platform) || [];
      arr.push(a); byPlatform.set(a.platform, arr);
    }

    const errors: string[] = [];
    for (const [platform, accs] of byPlatform.entries()) {
      const ptype = PLATFORM_CODE[platform];
      if (!ptype) {
        errors.push(`${PLATFORM_LABEL[platform] || platform}: 暂不支持`);
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: "平台暂不支持", finished_at: new Date().toISOString(),
        }).eq("job_id", jobId).eq("platform", platform);
        continue;
      }
      const accountList = accs.map(a => a.worker_account_id).filter(Boolean);
      if (accountList.length === 0) {
        errors.push(`${PLATFORM_LABEL[platform]}: 账号未在 worker 注册,请重新扫码`);
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: "账号未在 worker 注册", finished_at: new Date().toISOString(),
        }).eq("job_id", jobId).in("account_id", accs.map(a => a.id));
        continue;
      }
      const payload: any = {
        fileList: [workerFilePath],
        accountList,
        type: ptype,
        title: title.slice(0, 50),
        tags,
        category: category || undefined,
        enableTimer: !!schedule.enable,
        videosPerDay: schedule.videos_per_day || 1,
        dailyTimes: schedule.daily_times || [9, 14, 20],
        startDays: schedule.start_days || 0,
      };
      try {
        const r = await sauFetch("/postVideoBatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await r.text();
        if (!r.ok) {
          errors.push(`${PLATFORM_LABEL[platform]}: worker ${r.status} ${text.slice(0, 120)}`);
          await supa.from("social_publish_targets").update({
            status: "failed", error_message: `worker ${r.status}: ${text.slice(0, 200)}`, finished_at: new Date().toISOString(),
          }).eq("job_id", jobId).in("account_id", accs.map(a => a.id));
        } else {
          // worker 不返回回执,标记 submitted (= 视为已交付平台后台)
          await supa.from("social_publish_targets").update({
            status: "submitted", progress: 100, started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          }).eq("job_id", jobId).in("account_id", accs.map(a => a.id));
        }
      } catch (e) {
        errors.push(`${PLATFORM_LABEL[platform]}: ${String(e)}`);
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: String(e), finished_at: new Date().toISOString(),
        }).eq("job_id", jobId).in("account_id", accs.map(a => a.id));
      }
    }

    // 父任务终态
    const { data: finalTargets } = await supa.from("social_publish_targets").select("status").eq("job_id", jobId);
    const allSubmitted = (finalTargets || []).every(t => t.status === "submitted");
    const anyOk = (finalTargets || []).some(t => t.status === "submitted");
    await supa.from("social_publish_jobs").update({
      status: allSubmitted ? "submitted" : anyOk ? "partial" : "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    return new Response(JSON.stringify({ job_id: jobId, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

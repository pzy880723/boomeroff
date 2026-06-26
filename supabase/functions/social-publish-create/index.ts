// 1) 校权 + 取 asset 2) 把视频字节从我们 Storage / 远端 URL 流到 worker /upload
// 3) 建父子任务 4) schedule_at 在未来则不分发等 cron 派单;否则直接分发到平台
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauFetch } from "../_shared/sau.ts";
import { dispatchToWorker, finalizeJobStatus } from "../_shared/social-dispatch.ts";

interface ScheduleConfig {
  enable: boolean;
  videos_per_day?: number;
  daily_times?: number[];
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
    // 节点定时:ISO 字符串(未来时间则不立刻分发,留给 cron)
    const scheduleAtRaw = (body.schedule_at as string | undefined)?.trim();
    let scheduleAt: Date | null = null;
    if (scheduleAtRaw) {
      const d = new Date(scheduleAtRaw);
      if (!isNaN(d.getTime())) scheduleAt = d;
    }
    const isDelayed = scheduleAt && scheduleAt.getTime() > Date.now() + 30_000; // 30s 缓冲

    if (!assetId || accountIds.length === 0 || !title) {
      return new Response(JSON.stringify({ error: "asset_id / account_ids / title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

    const { data: accounts } = await supa.from("social_accounts").select("*").in("id", accountIds);
    if (!accounts || accounts.length !== accountIds.length) {
      return new Response(JSON.stringify({ error: "some accounts not found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const shopId = accounts[0].shop_id;
    if (accounts.some((a) => a.shop_id !== shopId)) {
      return new Response(JSON.stringify({ error: "accounts must belong to same shop" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // 上传到 worker:即使是定时,也提前传好;worker 的临时文件保留时间一般够用
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

    const initialStatus = isDelayed ? "scheduled" : "running";
    const { data: jobRow, error: jobErr } = await supa.from("social_publish_jobs").insert({
      shop_id: shopId,
      asset_id: assetId,
      kind: "video",
      title,
      body: description,
      tags,
      cover_url: asset.meta?.poster_url || asset.meta?.cover_url || null,
      media_url: asset.output_url,
      per_platform: { category, schedule, schedule_at: scheduleAt?.toISOString() || null },
      schedule_at: scheduleAt?.toISOString() || null,
      status: initialStatus,
      created_by: userId,
      worker_file_path: workerFilePath,
    }).select().single();
    if (jobErr || !jobRow) {
      return new Response(JSON.stringify({ error: "建任务失败: " + jobErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jobId = jobRow.id;

    const targets = accounts.map((a) => ({
      job_id: jobId,
      account_id: a.id,
      platform: a.platform,
      status: isDelayed ? "scheduled" : "queued",
      progress: 0,
    }));
    await supa.from("social_publish_targets").insert(targets);

    // 定时任务:暂不分发,等 cron
    if (isDelayed) {
      return new Response(JSON.stringify({ job_id: jobId, scheduled: true, schedule_at: scheduleAt!.toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 立刻分发
    const errors = await dispatchToWorker(supa, {
      jobId, workerFilePath, title, tags, category,
      enableTimer: schedule.enable, videosPerDay: schedule.videos_per_day,
      dailyTimes: schedule.daily_times, startDays: schedule.start_days,
    }, accounts);
    await finalizeJobStatus(supa, jobId);

    return new Response(JSON.stringify({ job_id: jobId, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

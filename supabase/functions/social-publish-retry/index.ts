// 重试 job 内 failed 的 targets;不创建新 job,直接复用 worker_file_path
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchToWorker, finalizeJobStatus } from "../_shared/social-dispatch.ts";

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
    const jobId = body.job_id as string;
    const targetIds = (body.target_ids || []) as string[]; // 可选,只重试这些;空 = 全部 failed
    if (!jobId) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: job } = await supa.from("social_publish_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ error: "job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!job.worker_file_path) {
      return new Response(JSON.stringify({ error: "worker 文件已失效,请回素材库重新发起" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 权限
    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isAdmin = roleRow?.role === "admin";
    if (!isAdmin) {
      const { data: sp } = await supa.from("staff_profiles").select("shop_id").eq("user_id", userId).maybeSingle();
      if (sp?.shop_id !== job.shop_id) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 拉 failed targets
    let q = supa.from("social_publish_targets")
      .select("id, account_id, platform, status, retry_count, social_accounts!inner(id, platform, worker_account_id)")
      .eq("job_id", jobId).eq("status", "failed");
    if (targetIds.length > 0) q = q.in("id", targetIds);
    const { data: targets } = await q;

    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({ error: "没有可重试的失败任务" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 重置:queued + retry_count++
    await supa.from("social_publish_targets")
      .update({
        status: "queued",
        progress: 0,
        error_message: null,
        finished_at: null,
        last_retry_at: new Date().toISOString(),
      })
      .in("id", targets.map((t: any) => t.id));
    // 单独 bump retry_count(不能在一个 update 内引用旧值)
    for (const t of targets) {
      await supa.from("social_publish_targets")
        .update({ retry_count: (t.retry_count || 0) + 1 })
        .eq("id", t.id);
    }
    await supa.from("social_publish_jobs").update({
      status: "running", updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    const accounts = targets.map((t: any) => ({
      id: t.social_accounts.id,
      platform: t.social_accounts.platform,
      worker_account_id: t.social_accounts.worker_account_id,
    }));
    const per = job.per_platform || {};
    const schedule = per.schedule || {};
    const errors = await dispatchToWorker(supa, {
      jobId,
      workerFilePath: job.worker_file_path,
      title: job.title || "",
      tags: job.tags || [],
      category: per.category || "",
      enableTimer: schedule.enable,
      videosPerDay: schedule.videos_per_day,
      dailyTimes: schedule.daily_times,
      startDays: schedule.start_days,
    }, accounts);
    await finalizeJobStatus(supa, jobId);

    return new Response(JSON.stringify({ ok: true, retried: targets.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

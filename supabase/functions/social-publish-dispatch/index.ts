// Cron 派单:把 schedule_at <= now 的 scheduled 任务真正分发到 worker
// 由 pg_cron 每分钟调用
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dispatchToWorker, finalizeJobStatus } from "../_shared/social-dispatch.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date().toISOString();
    const { data: dueJobs } = await supa
      .from("social_publish_jobs")
      .select("*")
      .eq("status", "scheduled")
      .lte("schedule_at", now)
      .limit(20);

    const results: any[] = [];
    for (const job of dueJobs || []) {
      // 锁定:置为 running,避免并发重复
      const { data: locked } = await supa
        .from("social_publish_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("status", "scheduled")
        .select("id").maybeSingle();
      if (!locked) continue;

      const { data: targets } = await supa
        .from("social_publish_targets")
        .select("account_id, platform, social_accounts!inner(id, platform, worker_account_id)")
        .eq("job_id", job.id)
        .in("status", ["scheduled", "queued"]);

      const accounts = (targets || []).map((t: any) => ({
        id: t.social_accounts.id,
        platform: t.social_accounts.platform,
        worker_account_id: t.social_accounts.worker_account_id,
      }));

      const per = job.per_platform || {};
      const schedule = per.schedule || {};
      const errors = await dispatchToWorker(supa, {
        jobId: job.id,
        workerFilePath: job.worker_file_path,
        title: job.title || "",
        tags: job.tags || [],
        category: per.category || "",
        enableTimer: schedule.enable,
        videosPerDay: schedule.videos_per_day,
        dailyTimes: schedule.daily_times,
        startDays: schedule.start_days,
      }, accounts);
      await finalizeJobStatus(supa, job.id);
      results.push({ job_id: job.id, errors });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// pg_cron 每分钟调:1) 把到点的 scheduled job 放入 Worker 队列 2) 回收超时任务。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();

  // 1) 到点定时任务
  const { data: due } = await supa.from("social_publish_jobs")
    .select("*").eq("status", "scheduled").lte("schedule_at", now).limit(20);
  for (const job of due || []) {
    await supa.from("social_publish_jobs").update({ status: "queued", updated_at: now }).eq("id", job.id);
    await supa.from("social_publish_targets").update({
      status: "pending", progress: 0, error_message: null, last_step: "scheduled_queued",
    }).eq("job_id", job.id).eq("status", "scheduled");
  }

  // 2) 回收 30 分钟未回执的 running
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuck } = await supa.from("social_publish_targets")
    .select("id").eq("status", "running").lt("started_at", cutoff).limit(50);
  if (stuck?.length) {
    await supa.from("social_publish_targets").update({
      status: "failed", error_message: "超时未回执,请重试", finished_at: now,
    }).in("id", stuck.map((s: any) => s.id));
  }

  return new Response(JSON.stringify({ ok: true, dispatched: due?.length || 0, recovered: stuck?.length || 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

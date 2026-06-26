// pg_cron 每分钟调:1) 把到点的 scheduled job 派出去 2) 回收 30 分钟未回执的 running。
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sauPostVideoBatch, PLATFORM_CODE, PLATFORM_LABEL } from "../_shared/sau.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date().toISOString();

  // 1) 到点定时任务
  const { data: due } = await supa.from("social_publish_jobs")
    .select("*").eq("status", "scheduled").lte("schedule_at", now).limit(20);
  for (const job of due || []) {
    if (job.kind !== "video" || !job.worker_file_path) {
      await supa.from("social_publish_jobs").update({ status: "failed" }).eq("id", job.id);
      await supa.from("social_publish_targets").update({
        status: "failed", error_message: "worker 文件已过期,请重新发布", finished_at: now,
      }).eq("job_id", job.id);
      continue;
    }
    const { data: tgs } = await supa.from("social_publish_targets")
      .select("*, account:social_accounts(*)").eq("job_id", job.id).eq("status", "scheduled");
    await supa.from("social_publish_jobs").update({ status: "running", updated_at: now }).eq("id", job.id);
    const byPlat = new Map<string, any[]>();
    for (const t of tgs || []) {
      const arr = byPlat.get(t.platform) || [];
      arr.push(t); byPlat.set(t.platform, arr);
    }
    for (const [platform, arr] of byPlat.entries()) {
      const accIds = arr.map((t) => t.account_id);
      const workerAccs = arr.map((t) => t.account?.worker_account_id).filter(Boolean);
      if (!workerAccs.length) {
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: "账号已失效", finished_at: now,
        }).eq("job_id", job.id).in("account_id", accIds);
        continue;
      }
      await supa.from("social_publish_targets").update({ status: "running", started_at: now }).eq("job_id", job.id).in("account_id", accIds);
      const pp = (job.per_platform || {})[platform] || {};
      const res = await sauPostVideoBatch({
        filePath: job.worker_file_path,
        accountIds: workerAccs, platformCode: PLATFORM_CODE[platform],
        title: pp.title || job.title, tags: pp.tags?.length ? pp.tags : (job.tags || []),
        category: pp.category,
      });
      if (!res.ok) {
        await supa.from("social_publish_targets").update({
          status: "failed", error_message: `${PLATFORM_LABEL[platform]}: ${res.error}`, finished_at: now,
        }).eq("job_id", job.id).in("account_id", accIds);
      } else {
        await supa.from("social_publish_targets").update({
          status: "success", progress: 100, finished_at: now,
        }).eq("job_id", job.id).in("account_id", accIds);
      }
    }
    // finalize
    const { data: all } = await supa.from("social_publish_targets").select("status").eq("job_id", job.id);
    const ok = (all || []).filter((t: any) => t.status === "success").length;
    const next = ok === (all || []).length ? "done" : ok > 0 ? "partial" : "failed";
    await supa.from("social_publish_jobs").update({ status: next, updated_at: now }).eq("id", job.id);
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

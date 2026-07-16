// director-cron-tick:
// 后台推进「帮你拍一条」导演任务。由定时任务每分钟触发,不依赖前端轮询。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isVolcesTosUrl, mirrorTosVideoToStorage } from "../_shared/mirror-tos-video.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_TASK_BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const ACTIVE_STATUSES = ["queued", "character", "shooting", "generating_voice", "ready_to_stitch", "composing"];

async function pollArk(arkKey: string, taskId: string) {
  const r = await fetch(`${ARK_TASK_BASE}/${taskId}`, { headers: { Authorization: `Bearer ${arkKey}` } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { status: "running", video_url: null, error: j?.error?.message || `查询失败(${r.status})` };
  return {
    status: String(j.status || "running"),
    video_url: (j?.content?.video_url || j?.video_url) as string | null,
    error: j?.error?.message as string | undefined,
  };
}

async function triggerFunction(functionName: string, jobId: string, supabaseUrl: string, serviceKey: string) {
  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ job_id: jobId }),
  }).then(async (response) => {
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[director-cron] ${functionName} failed`, jobId, response.status, detail.slice(0, 200));
    }
  }).catch((e) => console.warn(`[director-cron] ${functionName} fire failed`, jobId, e));
}

async function triggerPostTasks(admin: any, job: any, supabaseUrl: string, serviceKey: string) {
  let meta = (job.meta as any) || {};
  const voiceReady = !!meta.voiceover?.generated_at && !meta.voiceover?.error;
  const copyReady = !!meta.publish_copy?.generated_at;
  const inflight = (meta.__inflight ?? {}) as { voice_at?: number; copy_at?: number };
  const now = Date.now();
  const STALE_MS = 90_000;
  const tasks: Promise<unknown>[] = [];

  if (!voiceReady && (!inflight.voice_at || now - inflight.voice_at > STALE_MS)) {
    inflight.voice_at = now;
    tasks.push(triggerFunction("director-generate-voiceover", job.id, supabaseUrl, serviceKey));
  }
  if (!copyReady && (!inflight.copy_at || now - inflight.copy_at > STALE_MS)) {
    inflight.copy_at = now;
    tasks.push(triggerFunction("director-generate-publish-copy", job.id, supabaseUrl, serviceKey));
  }
  if (tasks.length) {
    meta = { ...meta, __inflight: inflight, publish_copy_status: copyReady ? "done" : "running" };
    await admin.from("video_generation_jobs").update({ meta }).eq("id", job.id);
    job.meta = meta;
    // @ts-ignore EdgeRuntime.waitUntil for background tasks
    if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
      (globalThis as any).EdgeRuntime.waitUntil(Promise.all(tasks));
    }
  }
  return tasks.length;
}

async function queueComposeIfReady(admin: any, job: any) {
  const meta = (job.meta as any) || {};
  const voiceReady = !!meta.voiceover?.generated_at && !meta.voiceover?.error;
  const copyReady = !!meta.publish_copy?.generated_at;
  if (!voiceReady || !copyReady) return false;
  if (job.compose_status !== "idle") return false;
  const { data } = await admin.from("video_generation_jobs").update({
    status: "composing",
    compose_status: "queued",
    compose_error: null,
  }).eq("id", job.id).eq("compose_status", "idle").select("id").maybeSingle();
  return !!data;
}

async function processJob(admin: any, job: any, env: { arkKey: string; supabaseUrl: string; serviceKey: string }) {
  const { data: shotsRaw } = await admin
    .from("video_generation_shots")
    .select("*")
    .eq("job_id", job.id)
    .order("shot_index");
  const shots = shotsRaw || [];
  const hasSubmitted = shots.some((s: any) => s.seedance_task_id || ["submitting", "running", "succeeded"].includes(String(s.status || "")));

  if (["queued", "character", "shooting"].includes(String(job.status || "")) && !hasSubmitted) {
    await triggerFunction("director-run-pipeline", job.id, env.supabaseUrl, env.serviceKey);
    return { id: job.id, action: "pipeline_triggered" };
  }

  for (const shot of shots) {
    if (!shot.seedance_task_id || ["succeeded", "failed"].includes(String(shot.status || ""))) continue;
    const r = await pollArk(env.arkKey, shot.seedance_task_id);
    if (r.status === "succeeded" && r.video_url) {
      let finalUrl = r.video_url;
      if (isVolcesTosUrl(r.video_url)) {
        const mirrored = await mirrorTosVideoToStorage(admin, job.user_id, shot.id, r.video_url)
          .catch((e) => ({ ok: false, error: (e as Error).message }));
        if ((mirrored as any).ok && (mirrored as any).url) finalUrl = (mirrored as any).url;
      }
      await admin.from("video_generation_shots").update({
        status: "succeeded",
        video_url: finalUrl,
        error_message: null,
      }).eq("id", shot.id);
      shot.status = "succeeded";
      shot.video_url = finalUrl;
    } else if (["failed", "expired", "cancelled"].includes(r.status)) {
      const message = r.error || `火山返回 ${r.status}`;
      await admin.from("video_generation_shots").update({ status: "failed", error_message: message }).eq("id", shot.id);
      shot.status = "failed";
      shot.error_message = message;
    }
  }

  const total = shots.length;
  const done = shots.filter((s: any) => s.status === "succeeded").length;
  const failedShots = shots.filter((s: any) => s.status === "failed");
  const allDone = total > 0 && done === total;
  const allSettled = total > 0 && done + failedShots.length === total;
  const meta = (job.meta as any) || {};
  const voiceReady = !!meta.voiceover?.generated_at && !meta.voiceover?.error;
  const copyReady = !!meta.publish_copy?.generated_at;
  const postReady = voiceReady && copyReady;

  if (failedShots.length && allSettled) {
    const message = failedShots[0]?.error_message || "有镜头失败";
    await admin.from("video_generation_jobs").update({ status: "failed", error_message: message }).eq("id", job.id);
    return { id: job.id, action: "failed", done, total, error: message };
  }

  if (allDone && !postReady) {
    if (job.status !== "generating_voice") {
      await admin.from("video_generation_jobs").update({ status: "generating_voice", error_message: null }).eq("id", job.id);
      job.status = "generating_voice";
    }
    const triggered = await triggerPostTasks(admin, job, env.supabaseUrl, env.serviceKey);
    return { id: job.id, action: "post_processing", done, total, triggered };
  }

  if (allDone && postReady && (job.status === "generating_voice" || job.status === "ready_to_stitch")) {
    if (job.status !== "ready_to_stitch") {
      await admin.from("video_generation_jobs").update({ status: "ready_to_stitch", error_message: null }).eq("id", job.id);
      job.status = "ready_to_stitch";
    }
    const queued = await queueComposeIfReady(admin, job);
    return { id: job.id, action: queued ? "compose_queued" : "ready", done, total };
  }

  if (job.status === "composing" && ["claimed", "running"].includes(String(job.compose_status || ""))) {
    const heartbeatAt = job.compose_heartbeat_at ? Date.parse(job.compose_heartbeat_at) : 0;
    if (heartbeatAt && Date.now() - heartbeatAt > 5 * 60_000) {
      await admin.from("video_generation_jobs").update({ compose_status: "queued", compose_worker_id: null }).eq("id", job.id);
      return { id: job.id, action: "compose_requeued", done, total };
    }
  }

  return { id: job.id, action: "checked", status: job.status, done, total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ ok: false, error: "缺少 ARK_API_KEY" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const lookback = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
    const { data: jobs, error } = await admin
      .from("video_generation_jobs")
      .select("*")
      .in("status", ACTIVE_STATUSES)
      .gt("created_at", lookback)
      .order("created_at", { ascending: true })
      .limit(12);
    if (error) return json({ ok: false, error: error.message }, 500);

    const results = [];
    for (const job of jobs || []) {
      try {
        results.push(await processJob(admin, job, { arkKey: ARK_KEY, supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY }));
      } catch (e) {
        const message = (e as Error).message || String(e);
        console.error("[director-cron] job failed", job.id, e);
        results.push({ id: job.id, action: "error", error: message });
      }
    }

    return json({ ok: true, checked: results.length, results });
  } catch (e) {
    console.error("[director-cron] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});
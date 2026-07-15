// director-poll-job:
// 前端轮询接口。查 job 状态 + 所有 shot 状态,同时把 running 的 seedance 任务
// 拉一次 ark 状态,回写 video_url / status。返回 job + shots 给前端渲染进度。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isVolcesTosUrl, mirrorTosVideoToStorage } from "../_shared/mirror-tos-video.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_TASK_BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";

async function pollArk(arkKey: string, taskId: string) {
  const r = await fetch(`${ARK_TASK_BASE}/${taskId}`, { headers: { Authorization: `Bearer ${arkKey}` } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { status: 'running', video_url: null, error: j?.error?.message || `查询失败(${r.status})` };
  return {
    status: j.status as string || 'running',
    video_url: (j?.content?.video_url || j?.video_url) as string | null,
    error: j?.error?.message as string | undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (!job || job.user_id !== u.user.id) return json({ ok: false, error: "任务不存在" }, 404);

    const { data: shots } = await admin
      .from("video_generation_shots").select("*").eq("job_id", jobId).order("shot_index");
    const shotList = shots || [];

    // 拉 ark 状态,回写还在跑的镜头
    if (ARK_KEY && shotList.length) {
      await Promise.all(shotList.map(async (s: any) => {
        if (!s.seedance_task_id) return;
        if (s.status === 'succeeded' || s.status === 'failed') return;
        try {
          const r = await pollArk(ARK_KEY, s.seedance_task_id);
          if (r.status === 'succeeded' && r.video_url) {
            // 火山 TOS 24h 会过期,立刻镜像
            let finalUrl = r.video_url;
            if (isVolcesTosUrl(r.video_url)) {
              const mr = await mirrorTosVideoToStorage(admin, job.user_id, s.id, r.video_url).catch((e) => ({ ok: false, error: (e as Error).message }));
              if ((mr as any).ok && (mr as any).url) finalUrl = (mr as any).url;
            }
            await admin.from("video_generation_shots").update({
              status: 'succeeded', video_url: finalUrl, error_message: null,
            }).eq("id", s.id);
            s.status = 'succeeded';
            s.video_url = finalUrl;
          } else if (r.status === 'failed' || r.status === 'expired' || r.status === 'cancelled') {
            await admin.from("video_generation_shots").update({
              status: 'failed', error_message: r.error || `火山返回 ${r.status}`,
            }).eq("id", s.id);
            s.status = 'failed';
            s.error_message = r.error || `火山返回 ${r.status}`;
          }
        } catch (e) {
          console.warn("[director-poll-job] pollArk error", s.shot_index, e);
        }
      }));
    }

    // 汇总 job status —— 严格分两阶段:
    //   镜头全部 succeeded → generating_voice (仅触发配音+文案,不入合成队列)
    //   voiceover.generated_at && publish_copy.generated_at → ready_to_stitch → (worker模式) composing/queued
    const total = shotList.length;
    const done = shotList.filter((s: any) => s.status === 'succeeded').length;
    const failed = shotList.some((s: any) => s.status === 'failed');
    const allDone = done === total && total > 0;
    const allSettled = (done + shotList.filter((s: any) => s.status === 'failed').length) === total;

    let jobMeta = (job.meta as any) || {};
    const voiceReady = !!jobMeta.voiceover?.generated_at && !jobMeta.voiceover?.error;
    const copyReady = !!jobMeta.publish_copy?.generated_at;
    const postReady = voiceReady && copyReady;

    let nextStatus = job.status;
    if (job.status === 'shooting' || job.status === 'queued' || job.status === 'character') {
      if (failed && allSettled) {
        nextStatus = 'failed';
      } else if (allDone) {
        // 先进入配音/文案阶段,禁止直接跳到 ready_to_stitch
        nextStatus = postReady ? 'ready_to_stitch' : 'generating_voice';
      }
    } else if (job.status === 'generating_voice' && postReady) {
      nextStatus = 'ready_to_stitch';
    }

    if (nextStatus !== job.status) {
      await admin.from("video_generation_jobs").update({
        status: nextStatus,
        error_message: failed && nextStatus === 'failed'
          ? (shotList.find((s: any) => s.status === 'failed')?.error_message || '有镜头失败')
          : null,
      }).eq("id", jobId);
      job.status = nextStatus;
    }

    // generating_voice 阶段:并发触发 voiceover + publish_copy,直到两者 generated_at 都写入
    if (job.status === 'generating_voice') {
      const needVoice = !voiceReady;
      const needCopy = !copyReady;
      const fnBase = `${SUPABASE_URL}/functions/v1`;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` };
      const tasks: Promise<unknown>[] = [];
      const inflight = (jobMeta.__inflight ?? {}) as { voice_at?: number; copy_at?: number };
      const now = Date.now();
      const STALE_MS = 90_000; // 90s 无回执才允许重触发,避免刷屏
      if (needVoice && (!inflight.voice_at || now - inflight.voice_at > STALE_MS)) {
        inflight.voice_at = now;
        tasks.push(fetch(`${fnBase}/director-generate-voiceover`, {
          method: "POST", headers, body: JSON.stringify({ job_id: jobId }),
        }).catch((e) => console.warn("[poll-job] voiceover fire-and-forget", e)));
      }
      if (needCopy && (!inflight.copy_at || now - inflight.copy_at > STALE_MS)) {
        inflight.copy_at = now;
        tasks.push(fetch(`${fnBase}/director-generate-publish-copy`, {
          method: "POST", headers, body: JSON.stringify({ job_id: jobId }),
        }).catch((e) => console.warn("[poll-job] publish-copy fire-and-forget", e)));
      }
      if (tasks.length) {
        jobMeta = { ...jobMeta, __inflight: inflight };
        await admin.from("video_generation_jobs").update({ meta: jobMeta }).eq("id", jobId);
        job.meta = jobMeta;
        // @ts-ignore EdgeRuntime.waitUntil for background tasks
        if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
          (globalThis as any).EdgeRuntime.waitUntil(Promise.all(tasks));
        }
      }
    }

    // 只有 ready_to_stitch(即配音+文案都已 generated_at) 才允许把 job 推入 Worker 合成队列
    if (job.status === 'ready_to_stitch' && job.compose_status === 'idle' && postReady) {
      const { data: setting } = await admin.from("app_settings").select("value").eq("key", "compose_mode").maybeSingle();
      const mode = (setting?.value as any)?.mode || (setting?.value as any) || 'worker';
      if (mode === 'worker') {
        const upd = await admin.from("video_generation_jobs").update({
          status: 'composing', compose_status: 'queued',
        }).eq("id", jobId).eq("compose_status", "idle").select("id").maybeSingle();
        if (upd.data) {
          job.status = 'composing';
          job.compose_status = 'queued';
        }
      }
    }


    return json({
      ok: true,
      job: {
        id: job.id, status: job.status, duration: job.duration, aspect_ratio: job.aspect_ratio,
        character_json: job.character_json, script_json: job.script_json,
        final_video_url: job.final_video_url, cover_url: job.cover_url,
        error_message: job.error_message, meta: job.meta,
        compose_status: job.compose_status, compose_error: job.compose_error,
        compose_heartbeat_at: job.compose_heartbeat_at,
        compose_worker_id: job.compose_worker_id,
      },
      shots: shotList.map((s: any) => ({
        id: s.id, shot_index: s.shot_index, duration: Number(s.duration),
        scene: s.scene, subject: s.subject, action: s.action, camera: s.camera,
        subtitle: s.subtitle, dialogue: s.dialogue,
        status: s.status, video_url: s.video_url, first_frame_url: s.first_frame_url,
        error_message: s.error_message, retry_count: s.retry_count,
      })),
      progress: { done, total, failed: shotList.filter((s: any) => s.status === 'failed').length },
    });
  } catch (e) {
    console.error("[director-poll-job] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

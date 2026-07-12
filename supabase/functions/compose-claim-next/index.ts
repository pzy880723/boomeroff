// compose-claim-next:
// 外部 Codex Worker 用 X-Worker-Token 拉一个 compose_status='queued' 的任务,
// 原子改为 claimed 并返回完整合成包 (shots + voiceover + subtitles + character + publish_copy)。
// 同时把 heartbeat 超过 5 分钟的 claimed 任务回退到 queued,防止僵死。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TOKEN = Deno.env.get("COMPOSE_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COMPOSE_WORKER_TOKEN 未配置" }, 500);

    const provided = req.headers.get("x-worker-token");
    if (provided !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const workerId: string = body.worker_id || "unknown-worker";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 1. 回收僵死的 claimed 任务 (heartbeat > 5min)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await admin.from("video_generation_jobs")
      .update({ compose_status: "queued", compose_worker_id: null })
      .eq("compose_status", "claimed")
      .lt("compose_heartbeat_at", fiveMinAgo);

    // 2. 拿最老的一个 queued 任务
    const { data: candidates } = await admin
      .from("video_generation_jobs")
      .select("id")
      .eq("compose_status", "queued")
      .order("created_at", { ascending: true })
      .limit(1);

    if (!candidates?.length) return json({ ok: true, job: null });

    const jobId = candidates[0].id;
    const nowIso = new Date().toISOString();

    // 3. 原子认领 (CAS: 只在 compose_status 还是 queued 时更新)
    const { data: claimed, error: claimErr } = await admin
      .from("video_generation_jobs")
      .update({
        compose_status: "claimed",
        compose_worker_id: workerId,
        compose_claimed_at: nowIso,
        compose_heartbeat_at: nowIso,
        compose_error: null,
      })
      .eq("id", jobId)
      .eq("compose_status", "queued")
      .select("*")
      .maybeSingle();

    if (claimErr || !claimed) return json({ ok: true, job: null }); // 被别人抢了

    const { data: shots } = await admin
      .from("video_generation_shots").select("*").eq("job_id", jobId).order("shot_index");

    return json({
      ok: true,
      job: {
        id: claimed.id,
        user_id: claimed.user_id,
        shop_id: claimed.shop_id,
        duration: claimed.duration,
        aspect_ratio: claimed.aspect_ratio,
        character: claimed.character_json,
        script: claimed.script_json,
        user_prompt: claimed.user_prompt,
        publish_copy: (claimed.meta as any)?.publish_copy || null,
        subtitles: (claimed.meta as any)?.subtitles || [],
        voiceover: (claimed.meta as any)?.voiceover || null,
      },
      shots: (shots || []).map((s: any) => ({
        shot_index: s.shot_index,
        duration: Number(s.duration),
        video_url: s.video_url,
        subtitle: s.subtitle,
        dialogue: s.dialogue,
        voiceover_url: (s.meta as any)?.voiceover_url || null,
        voiceover_duration_s: (s.meta as any)?.voiceover_duration_s || null,
      })),
      claim: {
        worker_id: workerId,
        claimed_at: nowIso,
        callback_url: `${SUPABASE_URL}/functions/v1/compose-callback`,
        heartbeat_url: `${SUPABASE_URL}/functions/v1/compose-heartbeat`,
      },
    });
  } catch (e) {
    console.error("[compose-claim-next] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

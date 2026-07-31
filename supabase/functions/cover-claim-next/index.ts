// cover-claim-next: 腾讯云 Worker 用 X-Worker-Token 领取一条 cover_generation.status='queued' 的封面任务。
// 原子 CAS(queued → claimed),幂等;心跳超过 5 分钟的 claimed/generating 回收成 queued。
// 严禁截图降级:参考帧只用于 Worker 识别人脸后交给 Seedream。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mergeCoverGeneration, readCoverGeneration } from "../_shared/cover-generation.ts";

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
    const TOKEN = Deno.env.get("COVER_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COVER_WORKER_TOKEN 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const workerId: string = body.worker_id || "unknown-worker";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const nowIso = new Date().toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // 1. 回收僵死任务
    const { data: stale } = await admin
      .from("marketing_video_jobs")
      .select("id, fallback_notes")
      .in("fallback_notes->cover_generation->>status", ["claimed", "generating"])
      .lt("fallback_notes->cover_generation->>heartbeat_at", fiveMinAgo)
      .limit(10);
    for (const row of stale || []) {
      await admin.from("marketing_video_jobs")
        .update({ fallback_notes: mergeCoverGeneration(row.fallback_notes, { status: "queued", worker_id: null, claimed_at: null }) })
        .eq("id", row.id)
        .in("fallback_notes->cover_generation->>status", ["claimed", "generating"]);
    }

    // 2. 取最老的 queued 任务(必须已有 video_url)
    const { data: candidates } = await admin
      .from("marketing_video_jobs")
      .select("id, video_url, script, fallback_notes")
      .eq("status", "succeeded")
      .not("video_url", "is", null)
      .eq("fallback_notes->cover_generation->>status", "queued")
      .order("created_at", { ascending: true })
      .limit(10);

    const candidate = (candidates || []).find((c: any) => !!c.video_url);
    if (!candidate) return json({ ok: true, job: null });

    // 3. 原子认领
    const cg = readCoverGeneration(candidate.fallback_notes)!;
    const merged = mergeCoverGeneration(candidate.fallback_notes, {
      status: "claimed",
      worker_id: workerId,
      claimed_at: nowIso,
      heartbeat_at: nowIso,
      error: null,
    });
    const { data: claimed } = await admin
      .from("marketing_video_jobs")
      .update({ fallback_notes: merged })
      .eq("id", candidate.id)
      .eq("fallback_notes->cover_generation->>status", "queued")
      .select("id, video_url, script, fallback_notes")
      .maybeSingle();
    if (!claimed) return json({ ok: true, job: null }); // 被别人抢了

    const script = (claimed.script as any) || {};
    const claimedCg = readCoverGeneration(claimed.fallback_notes) || cg;

    return json({
      ok: true,
      job: {
        id: claimed.id,
        video_url: claimed.video_url,
        title: script.title || script.topic || "",
        script,
        cover_generation: {
          status: claimedCg.status,
          copy: claimedCg.copy,
          variation: claimedCg.variation,
          copy_fingerprint: claimedCg.copy_fingerprint,
          variation_key: claimedCg.variation_key,
        },
      },
      claim: {
        callback_url: `${SUPABASE_URL}/functions/v1/cover-callback`,
        heartbeat_url: `${SUPABASE_URL}/functions/v1/cover-heartbeat`,
      },
    });
  } catch (e) {
    console.error("[cover-claim-next] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

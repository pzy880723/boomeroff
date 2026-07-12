// compose-heartbeat: Worker 每 30-60s 打一次心跳,证明还在跑
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
    const TOKEN = Deno.env.get("COMPOSE_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COMPOSE_WORKER_TOKEN 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const { job_id, worker_id, progress } = await req.json().catch(() => ({}));
    if (!job_id) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const patch: Record<string, unknown> = {
      compose_status: "running",
      compose_heartbeat_at: new Date().toISOString(),
    };
    if (worker_id) patch.compose_worker_id = worker_id;

    const { data: job } = await admin.from("video_generation_jobs").select("meta").eq("id", job_id).maybeSingle();
    if (job && progress !== undefined) {
      patch.meta = { ...((job.meta as any) || {}), compose_progress: progress };
    }

    await admin.from("video_generation_jobs")
      .update(patch)
      .eq("id", job_id)
      .in("compose_status", ["claimed", "running"]);

    return json({ ok: true });
  } catch (e) {
    console.error("[compose-heartbeat] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

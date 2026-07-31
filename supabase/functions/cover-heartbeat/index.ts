// cover-heartbeat: Worker 每 30-60s 汇报一次进度,防止封面任务被回收。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mergeCoverGeneration } from "../_shared/cover-generation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const TOKEN = Deno.env.get("COVER_WORKER_TOKEN");
    if (!TOKEN) return json({ ok: false, error: "COVER_WORKER_TOKEN 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const { job_id, worker_id, progress } = await req.json().catch(() => ({}));
    if (!job_id) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: job } = await admin
      .from("marketing_video_jobs").select("id, fallback_notes").eq("id", job_id).maybeSingle();
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    const patch: Record<string, unknown> = {
      status: "generating",
      heartbeat_at: new Date().toISOString(),
    };
    if (worker_id) patch.worker_id = worker_id;
    if (progress && typeof progress === "object") {
      patch.progress = {
        percent: Number((progress as any).percent) || 0,
        stage: String((progress as any).stage || ""),
        message: String((progress as any).message || ""),
      };
    }

    await admin.from("marketing_video_jobs")
      .update({ fallback_notes: mergeCoverGeneration(job.fallback_notes, patch) })
      .eq("id", job_id)
      .in("fallback_notes->cover_generation->>status", ["claimed", "generating"]);

    return json({ ok: true });
  } catch (e) {
    console.error("[cover-heartbeat] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

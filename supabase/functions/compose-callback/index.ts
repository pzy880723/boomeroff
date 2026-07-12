// compose-callback: Worker 合成完 mp4 后回写 final_video_url / cover_url,
// 落 marketing_assets(带 publish_copy),job.status='done', compose_status='done'
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
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId: string = body.job_id;
    const finalVideoUrl: string | undefined = body.final_video_url;
    const coverUrl: string | undefined = body.cover_url;
    const duration: number | undefined = body.duration_seconds;
    const errorMessage: string | undefined = body.error;

    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    // 失败上报
    if (errorMessage || !finalVideoUrl) {
      await admin.from("video_generation_jobs").update({
        compose_status: "failed",
        compose_error: errorMessage || "Worker 未返回视频 URL",
        status: "failed",
        error_message: errorMessage || "外部合成失败",
      }).eq("id", jobId);
      return json({ ok: true, marked: "failed" });
    }

    const script = (job.script_json as any) || {};
    const publishCopy = (job.meta as any)?.publish_copy || null;
    const finalCover = coverUrl || (job.character_json as any)?.reference_image_url || null;

    await admin.from("video_generation_jobs").update({
      compose_status: "done",
      compose_error: null,
      status: "done",
      final_video_url: finalVideoUrl,
      cover_url: finalCover,
      ...(duration ? { duration } : {}),
    }).eq("id", jobId);

    // 入素材库
    try {
      const title = publishCopy?.cover_title || script?.title || "BOOMER 惊喜一下 · 探店短片";
      await admin.from("marketing_assets").insert({
        user_id: job.user_id,
        shop_id: job.shop_id,
        kind: "video",
        output_url: finalVideoUrl,
        cover_url: finalCover,
        category: "惊喜一下",
        tags: publishCopy?.hashtags?.slice(0, 5).map((h: string) => h.replace(/^#/, "")) || ["惊喜一下", "探店", "BOOMER"],
        meta: {
          summary: title,
          source: "director-worker",
          director_job_id: jobId,
          duration_s: duration || job.duration,
          publish_copy: publishCopy,
        } as any,
      });
    } catch (e) {
      console.warn("[compose-callback] insert asset failed", e);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[compose-callback] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

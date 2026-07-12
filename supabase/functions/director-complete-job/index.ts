// director-complete-job:
// 前端把客户端拼接后的成片 URL(或单镜 URL,当只有一段时)交回来,
// 落最终成片 + 入 marketing_assets 素材库,job.status='done'。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id;
    const finalVideoUrl: string = body.final_video_url;
    const coverUrl: string | undefined = body.cover_url;
    if (!jobId || !finalVideoUrl) return json({ ok: false, error: "缺少 final_video_url" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (!job || job.user_id !== u.user.id) return json({ ok: false, error: "任务不存在" }, 404);

    await admin.from("video_generation_jobs").update({
      status: 'done',
      final_video_url: finalVideoUrl,
      cover_url: coverUrl || (job.character_json as any)?.reference_image_url || null,
    }).eq("id", jobId);

    // 落一条 marketing_assets(允许失败,不阻断)
    try {
      const script = job.script_json as any;
      const publishCopy = (job.meta as any)?.publish_copy || null;
      const title = publishCopy?.cover_title || script?.title || 'BOOMER 惊喜一下 · 探店短片';
      const tags = publishCopy?.hashtags?.length
        ? publishCopy.hashtags.slice(0, 5).map((h: string) => h.replace(/^#/, ''))
        : ['惊喜一下', '探店', 'BOOMER'];
      await admin.from("marketing_assets").insert({
        user_id: job.user_id,
        shop_id: job.shop_id,
        kind: 'video',
        output_url: finalVideoUrl,
        cover_url: coverUrl || (job.character_json as any)?.reference_image_url || null,
        category: '惊喜一下',
        tags,
        meta: {
          summary: title,
          source: 'director',
          director_job_id: jobId,
          duration_s: job.duration,
          publish_copy: publishCopy,
          subtitles: (job.meta as any)?.subtitles || null,
        } as any,
      });
    } catch (e) {
      console.warn("[director-complete-job] insert asset failed", e);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[director-complete-job] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

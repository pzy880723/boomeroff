// 视频渲染入队。MVP：写一条 marketing_video_jobs(queued)，并把脚本同步写到 marketing_assets。
// 实际 ffmpeg 渲染由后续 worker 完成；当前版本前端会显示"已排队、渲染将在后台完成"。
// 这样脚本是确定可消费的产物，店员能先把 6 条脚本一次性确认完，渲染按队列陆续返回。
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
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const script = body.script;
    if (!script || !script.hook || !Array.isArray(script.scenes) || !script.outro) {
      return json({ error: "脚本格式不完整" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: job, error: jErr } = await admin.from("marketing_video_jobs").insert({
      user_id: u.user.id,
      script,
      status: "queued",
    }).select().single();
    if (jErr) {
      console.error("[render] job insert", jErr);
      return json({ error: "排队失败" }, 500);
    }

    // 同步落 marketing_assets（kind=video，output 暂为空，后续 worker 写回）
    await admin.from("marketing_assets").insert({
      user_id: u.user.id,
      kind: "video",
      input_image_urls: Array.isArray(script.image_urls) ? script.image_urls : [],
      output_url: null,
      meta: {
        job_id: job.id,
        video_type: script.video_type,
        duration: script.total_duration_s,
        aspect: script.aspect,
        mode: script.mode || "text2video",
        topic: script.topic || "",
        status: "queued",
      },
    });


    return json({ success: true, job_id: job.id, status: "queued" });
  } catch (e) {
    console.error("[render] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

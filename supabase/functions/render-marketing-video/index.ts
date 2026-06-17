// 提交视频渲染任务到火山方舟 Seedance API,并把 task_id 落到 marketing_video_jobs。
// 前端通过 poll-marketing-video 轮询任务状态。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const DEFAULT_MODEL = "doubao-seedance-1-5-pro-251215";

function buildPrompt(script: any, style?: string): string {
  const parts: string[] = [];
  if (script.topic) parts.push(`主题:${script.topic}`);
  if (style) parts.push(`风格:${style}`);
  if (script.hook?.visual) parts.push(`开场:${script.hook.visual}`);
  if (Array.isArray(script.scenes)) {
    script.scenes.forEach((s: any, i: number) => {
      if (s?.visual) parts.push(`镜头${i + 1}:${s.visual}`);
    });
  }
  if (script.outro?.visual) parts.push(`结尾:${script.outro.visual}`);
  // 旁白(文案)作为画面外解说参考
  const narration = [
    script.hook?.line,
    ...(Array.isArray(script.scenes) ? script.scenes.map((s: any) => s?.line).filter(Boolean) : []),
    script.outro?.line,
  ].filter(Boolean).join(" ");
  if (narration) parts.push(`旁白:"${narration}"`);
  return parts.join("。").slice(0, 480);
}

function clampDuration(d: any): number {
  const n = Number(d) || 5;
  if (n < 4) return 4;
  if (n > 12) return 12;
  return Math.round(n);
}

function normalizeRatio(aspect: any): string {
  const a = String(aspect || "9:16");
  if (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(a)) return a;
  return "9:16";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ error: "未配置 ARK_API_KEY" }, 500);

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

    // 读取 admin 可覆盖的 model
    const { data: presets } = await admin.from("marketing_presets").select("value").eq("key", "video_model").maybeSingle();
    const model = (presets?.value as any)?.id || DEFAULT_MODEL;

    const prompt = buildPrompt(script, body.style);
    const ratio = normalizeRatio(script.aspect);
    const duration = clampDuration(script.total_duration_s);
    const imageUrls: string[] = Array.isArray(script.image_urls) ? script.image_urls : [];
    const firstImage = imageUrls[0];

    const content: any[] = [{ type: "text", text: prompt }];
    if (firstImage) {
      content.push({ type: "image_url", image_url: { url: firstImage }, role: "first_frame" });
    }

    const arkBody = {
      model,
      content,
      resolution: "720p",
      ratio,
      duration,
      watermark: false,
      generate_audio: true,
    };

    const arkRes = await fetch(ARK_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ARK_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(arkBody),
    });
    const arkJson = await arkRes.json().catch(() => ({}));
    if (!arkRes.ok || !arkJson?.id) {
      const msg = arkJson?.error?.message || arkJson?.message || `Seedance 创建任务失败(${arkRes.status})`;
      console.error("[render] ark error", arkRes.status, arkJson);
      return json({ error: msg, raw: arkJson }, 502);
    }

    const taskId: string = arkJson.id;

    const { data: job, error: jErr } = await admin.from("marketing_video_jobs").insert({
      user_id: u.user.id,
      script,
      status: "queued",
      provider: "volcengine_seedance",
      provider_task_id: taskId,
    }).select().single();
    if (jErr) {
      console.error("[render] job insert", jErr);
      return json({ error: "排队失败" }, 500);
    }

    await admin.from("marketing_assets").insert({
      user_id: u.user.id,
      kind: "video",
      input_image_urls: imageUrls,
      output_url: null,
      meta: {
        job_id: job.id,
        task_id: taskId,
        video_type: script.video_type,
        duration,
        aspect: ratio,
        mode: firstImage ? "image2video" : "text2video",
        topic: script.topic || "",
        style: body.style || null,
        model,
        status: "queued",
      },
    });

    return json({ success: true, job_id: job.id, task_id: taskId, status: "queued" });
  } catch (e) {
    console.error("[render] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

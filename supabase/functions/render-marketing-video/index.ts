// 提交视频渲染任务到火山方舟 Seedance API,并把 task_id 落到 marketing_video_jobs。
// 前端通过 poll-marketing-video 轮询任务状态。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey } from "../_shared/video-styles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const DEFAULT_MODEL = "doubao-seedance-1-5-pro-251215";

function buildPrompt(script: any, styleKey: VideoStyleKey): string {
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const lines: string[] = [];
  lines.push(`Strictly follow this storyboard. Do NOT add, remove, or reorder shots.`);
  lines.push(`Overall style: ${styleEn}. Brand: BOOMER·OFF vintage second-hand shop, dense shelves, warm interior.`);
  lines.push(`Aspect ratio ${script.aspect || '9:16'}, total duration ~${script.total_duration_s || 15}s.`);

  const pushShot = (label: string, sc: any) => {
    if (!sc) return;
    const dur = sc.duration_s || 2;
    const motion = sc.motion || 'hold';
    const vp = (sc.video_prompt || '').toString().trim();
    const txt = (sc.text || '').toString().trim();
    if (!vp && !txt) return;
    const parts = [`${label} (${dur}s, ${motion}):`];
    if (vp) parts.push(vp);
    if (txt) parts.push(`Chinese subtitle overlay: "${txt}".`);
    lines.push(parts.join(' '));
  };

  pushShot('Opening', script.hook);
  if (Array.isArray(script.scenes)) {
    script.scenes.forEach((sc: any, i: number) => pushShot(`Scene ${i + 1}`, sc));
  }
  pushShot('Ending', script.outro);

  const out = lines.join('\n');
  // Seedance 限制 prompt 长度,保留充足空间
  return out.length > 1800 ? out.slice(0, 1800) : out;
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

    const styleKey = normalizeStyle(body.style || script.style);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: presets } = await admin.from("marketing_presets").select("value").eq("key", "video_model").maybeSingle();
    const model = (presets?.value as any)?.id || DEFAULT_MODEL;

    const prompt = buildPrompt(script, styleKey);
    const ratio = normalizeRatio(script.aspect);
    const duration = clampDuration(script.total_duration_s);
    const imageUrls: string[] = Array.isArray(script.image_urls) ? script.image_urls : [];
    const firstImage = imageUrls[0];

    const content: any[] = [{ type: "text", text: prompt }];
    if (firstImage) {
      content.push({ type: "image_url", image_url: { url: firstImage }, role: "first_frame" });
    }

    const arkBody: Record<string, unknown> = {
      model,
      content,
      resolution: "720p",
      ratio,
      duration,
      watermark: false,
    };
    if (/seedance-(1-5|2)/i.test(model)) {
      arkBody.generate_audio = true;
    }

    console.log("[render] ark request", JSON.stringify({ model, ratio, duration, style: styleKey, hasImage: !!firstImage, promptLen: prompt.length }));

    const arkRes = await fetch(ARK_ENDPOINT, {
      method: "POST",
      headers: { "Authorization": `Bearer ${ARK_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(arkBody),
    });
    const arkJson = await arkRes.json().catch(() => ({}));
    if (!arkRes.ok || !arkJson?.id) {
      const msg = arkJson?.error?.message || arkJson?.message || `Seedance 创建任务失败(${arkRes.status})`;
      console.error("[render] ark error", arkRes.status, JSON.stringify(arkJson));
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
        style: styleKey,
        style_label: VIDEO_STYLE_LABELS[styleKey],
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

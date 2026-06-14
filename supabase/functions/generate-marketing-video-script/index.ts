// 生成视频脚本（结构化 JSON）。注入品牌上下文 + 视频类型 + 镜位标签，
// 让模型把每一镜分配到一张实际可用的图。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BRAND_SYSTEM_PROMPT, VIDEO_TYPE_RULES, VIDEO_TYPE_LABEL, type VideoType } from "../_shared/brand-context.ts";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const imageUrls: string[] = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 10) : [];
    const videoType: VideoType = (Object.keys(VIDEO_TYPE_RULES) as VideoType[]).includes(body.video_type)
      ? body.video_type : "store_tour";
    const duration: number = [15, 20, 30].includes(Number(body.duration)) ? Number(body.duration) : 15;
    const aspect: string = ["9:16", "1:1", "16:9"].includes(body.aspect) ? body.aspect : "9:16";
    const highlight = (body.highlight || "").toString().trim().slice(0, 80);
    const labels = Array.isArray(body.labels) ? body.labels : []; // 来自 analyze 步骤
    if (!imageUrls.length) return json({ error: "缺少素材" }, 400);

    const rule = VIDEO_TYPE_RULES[videoType];

    const sys = `${BRAND_SYSTEM_PROMPT}

你现在的任务是为店员生成一支「${VIDEO_TYPE_LABEL[videoType]}」短视频脚本。
${rule.scriptHint}

硬性约束：
- 总时长必须严格等于 ${duration} 秒。
- 画幅 ${aspect}。
- 必须使用店员真实上传的图片，每一镜的 image_index 必须落在 0..${imageUrls.length - 1} 之间。
- 不允许引用任何不存在的画面（不要描述"假设有店员推门进来"之类的镜头）。
- 字幕一律简体中文，每行不超过 14 字。
- 镜头条数 3–6 条；每条 2–5 秒。`;

    const labelLine = labels.length
      ? `店员上传图片的镜位标签（可用作选镜参考）：\n` + labels.map((x: any) => `  · index ${x.index}: ${x.slot} / ${x.subject} / ${x.quality}`).join("\n")
      : "";

    const userPrompt = `图片张数：${imageUrls.length}
${labelLine}
${highlight ? `店员想突出：${highlight}` : ""}

输出严格 JSON：
{
  "hook":  { "text": "<钩子字幕，≤14字>", "image_index": 0, "duration_s": 2, "motion": "<慢推近|缩放|平移|定格>" },
  "scenes": [
    { "text": "<中段字幕>", "image_index": 1, "duration_s": 3, "motion": "<推近|左滑|右滑|缩放|平移|定格>" }
  ],
  "outro": { "text": "<收尾字幕，可含 BOOMER·OFF>", "image_index": 2, "duration_s": 2, "motion": "定格" },
  "bgm":   "<lo-fi 轻松|城市夜晚|温暖民谣>",
  "total_duration_s": ${duration},
  "aspect": "${aspect}"
}
只输出 JSON，不要 \`\`\` 包裹。`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: [
            { type: "text", text: userPrompt },
            ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
          ] },
        ],
        temperature: 0.85,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[script] AI", aiRes.status, t.slice(0, 400));
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      if (aiRes.status === 429) return json({ error: "AI 限流，请稍后" }, 429);
      return json({ error: "AI 生成失败" }, 500);
    }
    const data = await aiRes.json();
    let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let script: any = null;
    try { script = JSON.parse(raw); } catch { /* */ }
    if (!script || !script.hook || !Array.isArray(script.scenes)) {
      return json({ error: "AI 返回格式异常" }, 500);
    }

    // 清洗：禁用词、image_index 越界、字幕长度
    const sanitize = (s: string) =>
      (s || "").replace(/主播/g, "店员").replace(/直播间/g, "店里")
        .replace(/保真|保证升值|秒杀|限时抢|全网最低/g, "").trim().slice(0, 28);
    const clampIdx = (n: any) => Math.min(Math.max(parseInt(n) || 0, 0), imageUrls.length - 1);

    script.hook.text = sanitize(script.hook.text);
    script.hook.image_index = clampIdx(script.hook.image_index);
    script.outro.text = sanitize(script.outro.text);
    script.outro.image_index = clampIdx(script.outro.image_index);
    script.scenes = script.scenes.slice(0, 6).map((sc: any) => ({
      text: sanitize(sc.text),
      image_index: clampIdx(sc.image_index),
      duration_s: Math.min(Math.max(Number(sc.duration_s) || 3, 1), 6),
      motion: sc.motion || "推近",
    }));
    script.aspect = aspect;
    script.total_duration_s = duration;
    script.image_urls = imageUrls; // 把图也带在脚本里，方便渲染端

    return json({ success: true, script, video_type: videoType, video_type_label: VIDEO_TYPE_LABEL[videoType] });
  } catch (e) {
    console.error("[script] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

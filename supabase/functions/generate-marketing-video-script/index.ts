// 生成「文生视频」脚本（结构化 JSON）。
// 输入:类型 / 时长 / 画幅 / 风格 + 与策划助理的对话记录(brief_transcript) + 可选参考图。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets, type VideoType } from "../_shared/brand-context.ts";
import { normalizeStyle, VIDEO_STYLE_LABELS, VIDEO_STYLE_EN } from "../_shared/video-styles.ts";

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

    const presets = await loadMarketingPresets();

    const body = await req.json().catch(() => ({}));
    const imageUrls: string[] = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 10) : [];
    const videoType: VideoType = (Object.keys(presets.videoRules) as VideoType[]).includes(body.video_type)
      ? body.video_type : "store_tour";
    const duration: number = [15, 20, 30].includes(Number(body.duration)) ? Number(body.duration) : 15;
    const aspect: string = ["9:16", "1:1", "16:9"].includes(body.aspect) ? body.aspect : "9:16";
    const topic = (body.topic || "").toString().trim().slice(0, 200);
    const highlight = (body.highlight || "").toString().trim().slice(0, 80);
    const styleKey = normalizeStyle(body.style);
    const briefTranscript = (body.brief_transcript || "").toString().trim().slice(0, 2000);

    const rule = presets.videoRules[videoType];

    const sys = `${presets.brand}

你现在的任务是为店员生成一支「${rule.label}」短视频的【文生视频脚本】。

重要：这是文生视频(text-to-video)，不是图片拼接。
- 每一镜要输出一段**英文 video_prompt**（描述画面、镜头运动、光线、节奏），用于交给视频生成模型直接生视频。
- 同时输出一段**中文字幕(text)**，用于叠加在画面上。
- 参考图(image_index)是**可选**的：如果店员上传了相关参考图，就用它来约束画面风格/商品/场景；没合适的就填 null。

整体风格基调:${VIDEO_STYLE_LABELS[styleKey]} — ${VIDEO_STYLE_EN[styleKey]}
每一条 video_prompt 都要自然融入这套基调(光线/色调/运镜/节奏)。

视频类型节奏指引：${rule.scriptHint}

硬性约束：
- 总时长 ≈ ${duration} 秒。
- 画幅 ${aspect}。
- 字幕一律简体中文，每行不超过 14 字。
- video_prompt 一律英文，每段不超过 60 个英文单词，必须包含主体/动作/镜头运动/光线四要素,并体现整体风格。
- 镜头条数 4–6 条；每条 2–5 秒。
- 不写"主播""直播间""保真""保证升值"等违禁词。`;

    const refList = imageUrls.length
      ? `店员上传的可选参考图（按 index 引用，0 起）：共 ${imageUrls.length} 张，已随消息附上。`
      : "店员没有上传参考图，所有镜头自由生成。";

    const briefBlock = briefTranscript
      ? `店员和策划助理刚刚的沟通记录(请严格基于这段对话提取拍摄要点):
"""
${briefTranscript}
"""`
      : "(没有额外的沟通记录,请根据主题自由发挥)";

    const userPrompt = `${briefBlock}

视频主题(兜底):${topic || rule.label}
${highlight ? `想突出:${highlight}` : ""}
${refList}

输出严格 JSON：
{
  "hook":  { "text": "<中文字幕,≤14字>", "video_prompt": "<English prompt>", "image_index": 0, "duration_s": 2, "motion": "<slow push-in|pan|zoom|hold>" },
  "scenes": [
    { "text": "<中文字幕>", "video_prompt": "<English prompt>", "image_index": null, "duration_s": 3, "motion": "<...>" }
  ],
  "outro": { "text": "<收尾字幕,可含 BOOMER·OFF>", "video_prompt": "<English prompt>", "image_index": null, "duration_s": 2, "motion": "hold" },
  "bgm":   "<lo-fi|city night|warm folk>",
  "total_duration_s": ${duration},
  "aspect": "${aspect}",
  "mode": "text2video"
}
只输出 JSON，不要 \`\`\` 包裹。`;

    const userContent: any[] = [{ type: "text", text: userPrompt }];
    if (imageUrls.length) {
      for (const url of imageUrls) userContent.push({ type: "image_url", image_url: { url } });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userContent },
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
    if (!script || !script.hook || !Array.isArray(script.scenes) || !script.outro) {
      return json({ error: "AI 返回格式异常" }, 500);
    }

    const sanitize = (s: string) =>
      (s || "").replace(/主播/g, "店员").replace(/直播间/g, "店里")
        .replace(/保真|保证升值|秒杀|限时抢|全网最低/g, "").trim().slice(0, 28);
    const clampIdx = (n: any): number | null => {
      if (n === null || n === undefined || n === "null") return null;
      const v = parseInt(n);
      if (isNaN(v) || imageUrls.length === 0) return null;
      return Math.min(Math.max(v, 0), imageUrls.length - 1);
    };
    const sanitizeScene = (sc: any) => ({
      text: sanitize(sc?.text),
      video_prompt: (sc?.video_prompt || "").toString().trim().slice(0, 400),
      image_index: clampIdx(sc?.image_index),
      duration_s: Math.min(Math.max(Number(sc?.duration_s) || 3, 1), 6),
      motion: (sc?.motion || "push-in").toString().slice(0, 32),
    });

    script.hook = sanitizeScene(script.hook);
    script.outro = sanitizeScene(script.outro);
    script.scenes = script.scenes.slice(0, 6).map(sanitizeScene);
    script.aspect = aspect;
    script.total_duration_s = duration;
    script.mode = "text2video";
    script.image_urls = imageUrls;
    script.topic = topic;
    script.style = styleKey;
    script.style_label = VIDEO_STYLE_LABELS[styleKey];

    return json({ success: true, script, video_type: videoType, video_type_label: rule.label });
  } catch (e) {
    console.error("[script] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

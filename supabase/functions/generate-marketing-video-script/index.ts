// 生成「文生视频」脚本（结构化 JSON）。
// 输入:类型 / 时长 / 画幅 / 风格 + 与策划助理的对话记录(brief_transcript) + 可选参考图。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets, type VideoType } from "../_shared/brand-context.ts";
import { normalizeStyle, VIDEO_STYLE_LABELS, VIDEO_STYLE_EN } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { kbSearch, formatKbBlock, kbSourcesMeta } from "../_shared/kb.ts";

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
    const imageUrls: string[] = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 20) : [];
    const videoType: VideoType = (Object.keys(presets.videoRules) as VideoType[]).includes(body.video_type)
      ? body.video_type : "store_tour";
    const duration: number = [15, 20, 30].includes(Number(body.duration)) ? Number(body.duration) : 15;
    // 按 ~2.5s/镜估算总镜数(含 hook + outro)
    const targetClips = Math.max(3, Math.round(duration / 2.5));    // 15→6, 20→8, 30→12
    const minScenes = Math.max(2, targetClips - 2);
    const maxScenes = targetClips + 1;
    const perClipMin = duration >= 25 ? 1.5 : 2;
    const perClipMax = duration >= 25 ? 3.5 : 5;
    const aspect: string = ["9:16", "1:1", "16:9"].includes(body.aspect) ? body.aspect : "9:16";
    const topic = (body.topic || "").toString().trim().slice(0, 200);
    const highlight = (body.highlight || "").toString().trim().slice(0, 80);
    const styleKey = normalizeStyle(body.style);
    const briefTranscript = (body.brief_transcript || "").toString().trim().slice(0, 2000);
    const approvedScript = (body.approved_script || "").toString().trim().slice(0, 3000);
    const imageDescriptions: { index: number; summary: string; best_for?: string }[] = Array.isArray(body.image_descriptions)
      ? body.image_descriptions.slice(0, 20)
      : [];
    const shopId: string | null = typeof body.shop_id === "string" && body.shop_id ? body.shop_id : null;
    const shopCtx = await loadShopContext(shopId);
    const shopBlock = formatShopContext(shopCtx);
    const character = (body.character && typeof body.character === "object") ? body.character : null;

    const rule = presets.videoRules[videoType];

    const characterBlock = character
      ? `
本片固定主角(每个出现人物的镜头都使用 TA,禁止换人/换发型/换服装):
- 名称：${character.name}
- 定位：${character.role_label || '主角'}
- 视觉标志：${character.visual_signature || '(以参考身份板为准)'}
- 核心情绪：${character.core_emotion || '自然'}
请在 scene / action 描述里自然地反复出现 TA。`
      : "";

    const adminKb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const kbQuery = [topic, highlight, rule.label, styleKey].filter(Boolean).join(' ');
    const kbHits = kbQuery ? await kbSearch(adminKb, { query: kbQuery, scope: 'video', shopId, k: 6 }) : [];
    const kbBlock = formatKbBlock(kbHits);

    const imgDescBlock = imageDescriptions.length
      ? `\n参考图描述(已经过 AI 识图,scene/action 必须基于这些具体细节):\n` +
        imageDescriptions.map((d) => `  [图 #${d.index}] ${d.summary}${d.best_for ? `(适合${d.best_for})` : ''}`).join('\n')
      : '';

    const approvedBlock = approvedScript
      ? `\n店员已确认的脚本草稿(请严格按这份脚本拆分镜,不要自由发挥):
"""
${approvedScript}
"""
拆分规则:
- 草稿里每段末尾的 [图 #N] 是该镜必须使用的参考图,image_index 必须等于 N,不许换。
- 草稿没标 [图 #N] 或写了 [无图] 的段,image_index 填 null。
- 段数 = 分镜数(开场 → hook,中段 → scenes,收尾 → outro)。
- scene/action 要把草稿里那段话的画面感讲具体(结合参考图描述里的细节)。`
      : '';

    const sys = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}${characterBlock}${kbBlock}${imgDescBlock}${approvedBlock}
你现在的任务是为店员生成一支「${rule.label}」短视频的【文生视频脚本】(全中文)。

重要：这是文生视频(text-to-video)。每一镜要给出**完整的中文描述**，让视频模型直接照拍。
每一镜必须输出以下 4 段(全部中文)：
- scene  场景描述：地点、环境、光线、色调、道具、画面构图、镜头景别(特写/中景/全景)。
- action 人物动作 / 镜头运动：人物在做什么 + 镜头怎么动(推/拉/摇/移/俯/仰/手持/定格)。如无人物只描写镜头。
- dialogue 台词 / 口播：人物说的话或画外音。没有就填空字符串 ""。
- subtitle 屏幕字幕：叠加在画面上的字幕，≤14 字，可与台词不同(更短)。

参考图(image_index)：${approvedScript
        ? '严格按草稿里的 [图 #N] 标记取值,不要自己挑。'
        : `当上传了参考图时，这是一个**素材池**(共 ${imageUrls.length} 张)。
为每一镜从池子里挑**最贴合那一镜内容**的那张，输出对应 index(0 起)。
不要所有镜头都用同一张；找不到合适的就填 null。`}

整体风格基调:${VIDEO_STYLE_LABELS[styleKey]}(${VIDEO_STYLE_EN[styleKey]})
每一镜的 scene / action 都要自然体现这套基调(光线/色调/运镜节奏)。

视频类型节奏指引：${rule.scriptHint}

硬性约束：
- 总时长 ≈ ${duration} 秒。
- 画幅 ${aspect}。
- 全部内容一律简体中文(包括 scene/action/dialogue/subtitle)。
- subtitle ≤ 14 字。scene 30–80 字，action 15–50 字，dialogue ≤ 30 字(可为空)。
- 镜头总条数 ≈ ${targetClips} 条(含 hook 和 outro),中段 scenes 数组长度在 ${minScenes}–${maxScenes} 之间;每条 ${perClipMin}–${perClipMax} 秒,所有镜头 duration_s 之和必须 ≈ ${duration} 秒。
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
  "hook":  { "scene": "<中文场景描述>", "action": "<中文人物动作/镜头运动>", "dialogue": "<中文台词,可为空字符串>", "subtitle": "<≤14字中文字幕>", "image_index": 0, "duration_s": 2, "motion": "推镜|拉镜|摇镜|移镜|手持|定格" },
  "scenes": [
    { "scene": "...", "action": "...", "dialogue": "...", "subtitle": "...", "image_index": null, "duration_s": 3, "motion": "..." }
  ],
  "outro": { "scene": "...", "action": "...", "dialogue": "...", "subtitle": "<收尾字幕,可含 BOOMER·OFF>", "image_index": null, "duration_s": 2, "motion": "定格" },
  "bgm":   "<lo-fi|城市夜色|暖民谣>",
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

    const clean = (s: any, max: number) =>
      (s || "").toString().replace(/主播/g, "店员").replace(/直播间/g, "店里")
        .replace(/保真|保证升值|秒杀|限时抢|全网最低/g, "").trim().slice(0, max);
    const clampIdx = (n: any): number | null => {
      if (n === null || n === undefined || n === "null") return null;
      const v = parseInt(n);
      if (isNaN(v) || imageUrls.length === 0) return null;
      return Math.min(Math.max(v, 0), imageUrls.length - 1);
    };
    const sanitizeScene = (sc: any) => ({
      scene: clean(sc?.scene, 200),
      action: clean(sc?.action, 120),
      dialogue: clean(sc?.dialogue, 60),
      subtitle: clean(sc?.subtitle ?? sc?.text, 14),
      image_index: clampIdx(sc?.image_index),
      duration_s: Math.min(Math.max(Number(sc?.duration_s) || 3, 1), perClipMax + 1),
      motion: (sc?.motion || "推镜").toString().slice(0, 16),
    });

    script.hook = sanitizeScene(script.hook);
    script.outro = sanitizeScene(script.outro);
    script.scenes = script.scenes.slice(0, maxScenes).map(sanitizeScene);
    if (script.scenes.length < minScenes) {
      console.warn(`[script] only ${script.scenes.length} scenes returned, expected >= ${minScenes} for ${duration}s`);
    }
    // 等比缩放,使总时长 ≈ duration
    {
      const allClips = [script.hook, ...script.scenes, script.outro];
      const sum = allClips.reduce((a: number, c: any) => a + (Number(c.duration_s) || 0), 0);
      if (sum > 0 && Math.abs(sum - duration) > 0.5) {
        const k = duration / sum;
        for (const c of allClips) {
          c.duration_s = Math.round(((Number(c.duration_s) || 0) * k) * 10) / 10;
        }
      }
    }
    script.aspect = aspect;
    script.total_duration_s = duration;
    script.mode = "text2video";
    script.image_urls = imageUrls;
    script.topic = topic;
    script.style = styleKey;
    script.style_label = VIDEO_STYLE_LABELS[styleKey];
    if (character) script.character = character;

    return json({ success: true, script, video_type: videoType, video_type_label: rule.label, __kb_sources: kbSourcesMeta(kbHits) });
  } catch (e) {
    console.error("[script] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

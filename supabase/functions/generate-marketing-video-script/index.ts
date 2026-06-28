// 生成「文生视频」脚本（结构化 JSON）。
// 输入:类型 / 时长 / 画幅 / 风格 + 与策划助理的对话记录(brief_transcript) + 可选参考图。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets, type VideoType } from "../_shared/brand-context.ts";
import { normalizeStyle, VIDEO_STYLE_LABELS, VIDEO_STYLE_EN } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { kbSearch, formatKbBlock, kbSourcesMeta } from "../_shared/kb.ts";
import { STOREFRONT_CONSTRAINT_ZH, sanitizeStorefrontText } from "../_shared/storefront-constraints.ts";

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
    const intent: string = typeof body.intent === "string" ? body.intent : "";
    const isViralStoreTour = intent === "viral_store_tour";


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

    const viralBlock = isViralStoreTour
      ? `

【洗脑探店口播模板 · 高转化优先】(本片必须按这套节奏拍)
- hook(≤2 秒)第一句必须是冲击型口语钩子,从这类句式里挑:"姐妹冲!"/"别再去 XX 了"/"我真的会谢"/"不是吧还有人不知道"/"这家店我能吹一年"。情绪要激动、有感染力。**钩子台词 ≤10 字**。
- 中段每镜 2-3 秒,scenes 数组 4-6 段;主角始终是同一个人(沿用上面锁定的角色),每镜必须有具体动作:指货架、拿起单品、试穿/试戴、转身展示、对镜头说话。
- 全片必须像真人连续口播,**dialogue 字数加起来 65–80 字**,每镜 10–14 字,**hook ≤10 字、CTA ≤10 字**;**所有镜头都必须有 dialogue,严禁空台词**(纯氛围画面会让视频太平,15 秒里至少 13 秒在说话)。
- 【贯穿主线】所有镜头的 dialogue 串起来要是一段连贯的"探店日记"——从「为什么走进这家店 → 一进门看到什么 → 上手体验/挑到什么 → 价格或惊喜点 → 谁适合来 → 喊大家冲」依次递进;反复点名店铺关键词(店名/品类/钩子产品)让观众记得住,不要每镜各说各的。
- 【硬规则】台词必须能在该镜 duration_s 内自然念完(按 5 字/秒激动口播估算,即 dialogue 字数 ≤ duration_s × 5)。超出就删字,Seedance 念得太赶会糊。
- subtitle 用大白话短句 + 情绪符号:"绝了!""巨好出片""人均 50 封顶""闭眼冲"。≤24 字。subtitle 可与 dialogue 不同,用来补关键信息。
- outro(≤2 秒)必须带 CTA,从这类句式里挑:"地址放评论区"/"现在冲"/"错过等一年"/"姐妹快去"。**CTA 台词 ≤10 字**。
- 画面色调明亮、节奏快,运镜以推镜/手持/特写切换为主,避免慢悠悠的长镜头。
- 【场景硬约束】本店在商场 B1 室内,是开放式 8 米无门店面;开场镜必须是「商场走廊视角 → 博主从走廊侧自然走入开放式店面」,严禁出现「推门 / 拉门 / 玻璃门 / 街边 / 马路 / 户外」等任何镜头与文字。
- 不要写成纪录片或氛围片,目标就是 15 秒抓人 + 让人想立刻去这家店。`
      : '';

    const sys = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}\n${STOREFRONT_CONSTRAINT_ZH}\n${characterBlock}${kbBlock}${imgDescBlock}${approvedBlock}${viralBlock}

你现在的任务是为店员生成一支「${rule.label}」短视频的【文生视频脚本】(全中文)。

重要：这是文生视频(text-to-video)。每一镜要给出**完整的中文描述**，让视频模型直接照拍。
每一镜必须输出以下 4 段(全部中文)：
- scene  场景描述：地点、环境、光线、色调、道具、画面构图、镜头景别(特写/中景/全景)。
- action 人物动作 / 镜头运动：人物在做什么 + 镜头怎么动(推/拉/摇/移/俯/仰/手持/定格)。如无人物只描写镜头。
- dialogue 台词 / 口播：人物说的话或画外音。没有就填空字符串 ""。
- subtitle 屏幕字幕：叠加在画面上的字幕，≤24 字，可与台词不同(更短)。

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
- subtitle ≤ 24 字。scene 30–80 字，action 15–50 字，dialogue ≤ ${isViralStoreTour ? 16 : 30} 字${isViralStoreTour ? '(洗脑探店每镜必须有 dialogue,不能为空)' : '(可为空)'}。
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
  "hook":  { "scene": "<中文场景描述>", "action": "<中文人物动作/镜头运动>", "dialogue": "<中文台词,可为空字符串>", "subtitle": "<≤24字中文字幕>", "image_index": 0, "duration_s": 2, "motion": "推镜|拉镜|摇镜|移镜|手持|定格" },
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
      sanitizeStorefrontText(
        (s || "").toString().replace(/主播/g, "店员").replace(/直播间/g, "店里")
          .replace(/保真|保证升值|秒杀|限时抢|全网最低/g, "")
      ).trim().slice(0, max);
    const clampIdx = (n: any): number | null => {
      if (n === null || n === undefined || n === "null") return null;
      const v = parseInt(n);
      if (isNaN(v) || imageUrls.length === 0) return null;
      return Math.min(Math.max(v, 0), imageUrls.length - 1);
    };
    const sanitizeScene = (sc: any) => ({
      scene: clean(sc?.scene, 200),
      action: clean(sc?.action, 120),
      dialogue: clean(sc?.dialogue, isViralStoreTour ? 16 : 60),
      subtitle: clean(sc?.subtitle ?? sc?.text, 24),
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
    // 软目标:总时长允许 ±20% 浮动,最终由渲染端按火山合法网格(5/10s)吸附,不再硬拉回 duration。
    {
      const allClips = [script.hook, ...script.scenes, script.outro];
      const sum = allClips.reduce((a: number, c: any) => a + (Number(c.duration_s) || 0), 0);
      const lo = duration * 0.7;
      const hi = duration * 1.3;
      if (sum > 0 && (sum < lo || sum > hi)) {
        const k = duration / sum;
        for (const c of allClips) {
          c.duration_s = Math.round(((Number(c.duration_s) || 0) * k) * 10) / 10;
        }
      }
    }

    // === 分镜与图片绑定校验 ===
    // 如果用户用了 approved_script,严格按草稿里 [图 #N] 标注重新绑定 image_index,
    // 并给每个镜头附上 image_binding: { source, expected, confidence }
    {
      const segments: { marker: number | null }[] = [];
      if (approvedScript) {
        const lines = approvedScript.split(/\r?\n/);
        for (const raw of lines) {
          const line = raw.trim();
          if (!/^(开场|中段\s*\d+|收尾)/.test(line)) continue;
          const mImg = line.match(/\[图\s*#\s*(\d+)\s*\]/);
          if (mImg) {
            const n = parseInt(mImg[1], 10);
            segments.push({ marker: imageUrls.length && n >= 0 && n < imageUrls.length ? n : null });
          } else {
            segments.push({ marker: null });
          }
        }
      }
      const allClips = [script.hook, ...script.scenes, script.outro];
      const applyBinding = (clip: any, seg?: { marker: number | null }) => {
        if (!seg || !approvedScript) {
          clip.image_binding = { source: 'free', expected: null, confidence: null };
          return;
        }
        if (seg.marker === null) {
          // 草稿标 [无图]
          clip.image_index = null;
          clip.image_binding = { source: 'unbound', expected: null, confidence: 1 };
          return;
        }
        const aiVal = clip.image_index;
        const matched = aiVal === seg.marker;
        clip.image_index = seg.marker; // 强制绑定
        clip.image_binding = {
          source: matched ? 'locked' : 'forced',
          expected: seg.marker,
          confidence: matched ? 1 : 0.6,
        };
      };
      if (segments.length && segments.length === allClips.length) {
        allClips.forEach((c, i) => applyBinding(c, segments[i]));
      } else if (segments.length) {
        // 段数不匹配:仍按顺序绑前 N 个,剩余标 free
        allClips.forEach((c, i) => applyBinding(c, segments[i]));
        console.warn(`[script] segments=${segments.length} vs clips=${allClips.length}, partial binding`);
      } else {
        allClips.forEach((c) => applyBinding(c));
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

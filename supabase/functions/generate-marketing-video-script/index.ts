// 生成「文生视频」脚本（结构化 JSON）。
// 输入:类型 / 时长 / 画幅 / 风格 + 与策划助理的对话记录(brief_transcript) + 可选参考图。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets, type VideoType } from "../_shared/brand-context.ts";
import { normalizeStyle, VIDEO_STYLE_LABELS, VIDEO_STYLE_EN } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { kbSearch, formatKbBlock, kbSourcesMeta } from "../_shared/kb.ts";
import { resolveStorefrontConstraintZh, sanitizeStorefrontText, usesOpenFrontMallConstraint } from "../_shared/storefront-constraints.ts";
import { scrubThirdPartyBrands, OWN_BRAND_LOCK_ZH } from "../_shared/brand-scrub.ts";
import { bindSurpriseReferences, normalizeSurpriseScript } from "../_shared/surprise-one-shot.ts";

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
    // 15s 走严格路径：固定 hook + 3 scenes + outro,每段 3s;>15s 沿用原公式
    const isTight15 = duration <= 15;
    const targetClips = isTight15 ? 5 : Math.max(3, Math.round(duration / 2.5));
    const minScenes = isTight15 ? 3 : Math.max(2, targetClips - 2);
    const maxScenes = isTight15 ? 3 : targetClips + 1;
    const perClipMin = isTight15 ? 3 : (duration >= 25 ? 1.5 : 2);
    const perClipMax = isTight15 ? 3 : (duration >= 25 ? 3.5 : 5);
    // 口播字数硬预算:4 汉字/秒(清晰口播),15s → 60 字
    const totalSpeakBudgetCn = Math.floor(duration * 4);
    const aspect: string = ["9:16", "1:1", "16:9"].includes(body.aspect) ? body.aspect : "9:16";
    // 用户输入(topic/highlight/brief)可能带真实商场名或第三方招牌关键词,
    // 进 AI 之前统一去敏,防止 Seedance 事后判"版权风险"拒绝出片。
    const topic = scrubThirdPartyBrands((body.topic || "").toString().trim().slice(0, 200));
    const highlight = scrubThirdPartyBrands((body.highlight || "").toString().trim().slice(0, 80));
    const styleKey = normalizeStyle(body.style);
    const briefTranscript = scrubThirdPartyBrands((body.brief_transcript || "").toString().trim().slice(0, 2000));
    const approvedScript = scrubThirdPartyBrands((body.approved_script || "").toString().trim().slice(0, 3000));
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
    const storefrontEvidence = `${shopBlock}\n${imageDescriptions.map((item) => item.summary || '').join('\n')}`;
    const strictOpenFront = usesOpenFrontMallConstraint(storefrontEvidence);
    const storefrontConstraint = resolveStorefrontConstraintZh(storefrontEvidence);
    const viralStorefrontRule = strictOpenFront
      ? '本店画像明确为商场 B1 的开放式无门店面;开场必须从商场走廊直接走入,禁止推门、玻璃门、街边、马路或户外。'
      : '门店结构必须严格照当前门店画像和参考图;禁止凭空编造商场楼层、街边环境、入口门体或店面尺寸。';

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

【惊喜一下 15 秒极速成片 · 连续口播模板】(本片必须严格按这套节奏拍,声音全程不能停)
- 【最高优先级 · 一条连续口播】全片使用同一条连续中文口播音轨。人物从 0.2 秒开始持续说到 14.8 秒,任意位置不得有超过 0.15 秒的停顿;切镜时口播继续,不允许重新起句、不允许重复台词、不允许留白。
- 【continuous_dialogue 硬规则】
  · 必须写完整的中文口播全文,58–62 个汉字。
  · 只允许使用中文逗号「，」或顿号「、」连接,不使用句号、感叹号、问号、省略号。
  · 严禁"大家好 / 各位姐妹 / 嗯 / 啊 / 那个 / 然后 / 就是"这类语气词、客套词、废话词。
  · 开头直接给钩子,中间连续输出门店卖点,结尾直接给行动号召。
  · 主旨固定为强力种草当前门店,但具体表达和卖点组合每次都要有新意。
- 【视觉分镜】仍然生成 5 段(hook + 3 scenes + outro),每段严格 3 秒,只负责画面设计与切镜时间。
  · 每段的 dialogue 字段留空字符串或写一句该段的画面关键词摘要即可,不再决定发声。
  · 每段可以补一个 cut_on_keyword 字段(2–6 个汉字),表示"念到这个关键词时切到本镜"。关键词必须真实出现在 continuous_dialogue 里。
  · 每段的 action 描述要写清楚"一边做××一边继续对镜头说话",不能出现"停下、静默、思考"等打断口播的措辞。
- 【贯穿主线】continuous_dialogue 是一段连贯的"探店日记":为什么走进这家店 → 一进门看到什么 → 上手体验/挑到什么 → 谁适合来 → 喊大家冲。反复点名店铺关键词(店名/品类/钩子产品)。
- 画面色调明亮、节奏快,运镜以推镜/手持/特写切换为主,避免慢悠悠的长镜头。
- 【场景硬约束】${viralStorefrontRule}
- 不要写成纪录片或氛围片,目标就是 15 秒抓人 + 让人想立刻去这家店。`
      : '';


    const sys = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}\n${storefrontConstraint}\n${OWN_BRAND_LOCK_ZH}\n${characterBlock}${kbBlock}${imgDescBlock}${approvedBlock}${viralBlock}

你现在的任务是为店员生成一支「${rule.label}」短视频的【文生视频脚本】(全中文)。

重要：这是文生视频(text-to-video)。每一镜要给出**完整的中文描述**，让视频模型直接照拍。
每一镜必须输出以下 4 段(全部中文)：
- scene  场景描述：地点、环境、光线、色调、道具、画面构图、镜头景别(特写/中景/全景)。
- action 人物动作 / 镜头运动：人物在做什么 + 镜头怎么动(推/拉/摇/移/俯/仰/手持/定格)。如无人物只描写镜头。
- dialogue 台词 / 口播：人物说的话或画外音。没有就填空字符串 ""。
- subtitle 屏幕字幕：叠加在画面上的字幕，≤24 字，可与台词不同(更短)。

参考图(image_index)：${approvedScript
        ? '严格按草稿里的 [图 #N] 标记取值,不要自己挑。'
        : isViralStoreTour
          ? `共 ${imageUrls.length} 张实景图。五个节奏段都必须填写有效 image_index;按内容选择最贴合的图,图片少于五张时允许合理复用,但不允许任何一段填 null。`
        : `当上传了参考图时，这是一个**素材池**(共 ${imageUrls.length} 张)。
为每一镜从池子里挑**最贴合那一镜内容**的那张，输出对应 index(0 起)。
不要所有镜头都用同一张；找不到合适的就填 null。`}

整体风格基调:${VIDEO_STYLE_LABELS[styleKey]}(${VIDEO_STYLE_EN[styleKey]})
每一镜的 scene / action 都要自然体现这套基调(光线/色调/运镜节奏)。

视频类型节奏指引：${rule.scriptHint}

硬性约束：
- 总时长 = ${duration} 秒。${isTight15 ? '\n- 【15 秒严格模式】必须写完整:1 个 hook + 3 个中段镜头 + 1 个 outro,总共 5 段,每段 3 秒,不多不少。' : ''}
- 画幅 ${aspect}。
- 全部内容一律简体中文(包括 scene/action/dialogue/subtitle)。
- subtitle ≤ 24 字。scene 30–80 字，action 15–50 字。
- 【口播字数硬预算】按 4 汉字/秒清晰口播计算,全片 dialogue 汉字合计 ≤ ${totalSpeakBudgetCn} 字。${isTight15 ? `
- 【15 秒最高优先级 · 边演边说】所有 5 段(hook + 3 中段 + outro)**都必须有非空 dialogue**,严禁纯氛围镜、严禁 dialogue 为空字符串。每一镜的 action 必须写成"边 ×× 边对镜头说 / 一边 ×× 一边讲",动作和口播在同一秒发生,不许"先做动作 → 停下 → 再说话"。
- hook.dialogue ≤ 8 字(必须是完整钩子,不许省略,不许半句,主角边走入店里边喊)。
- outro.dialogue ≤ 8 字(必须是完整 CTA/收尾,不许省略,不许半句,主角边定格/比手势边喊)。
- 中段每 scene.dialogue ≤ 14 字,与该镜动作同步说出。
- 宁可少说也不许写半句;宁可省一句中段也不许砍掉钩子或 CTA。全片说的话必须能在 ${duration} 秒内自然念完并且有头有尾。` : `- dialogue ≤ ${isViralStoreTour ? 16 : 30} 字${isViralStoreTour ? '(洗脑探店每镜必须有 dialogue,不能为空)' : '(可为空)'}。`}

- 镜头总条数${isTight15 ? ' = 5(hook + 3 scenes + outro)' : ` ≈ ${targetClips} 条(含 hook 和 outro),中段 scenes 数组长度在 ${minScenes}–${maxScenes} 之间`};每条 ${perClipMin}–${perClipMax} 秒${isTight15 ? '(严格 3 秒)' : ',所有镜头 duration_s 之和 ≈ ' + duration + ' 秒(允许 ±20% 浮动)'}。
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
  "title": "<≤14 字的中文标题，一眼看出这条视频拍的是什么，避免『视频/短片』这类无信息词>",
  "one_shot_prompt": "<${isViralStoreTour ? '必须为空字符串。惊喜一下以 hook/scenes/outro 为唯一脚本来源,服务端会确定性编译 Seedance 时间轴。' : `${isTight15 ? '【15 秒必填】' : '可留空字符串'}120–180 字中文导演稿。`}>",
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
说明:${isViralStoreTour
        ? 'hook/scenes/outro 就是店员确认和 Seedance 实际执行的同一份脚本。每段 dialogue 必须完整、明确、可直接逐字说出;one_shot_prompt 必须为空。'
        : 'hook/scenes/outro 用于分镜展示和后期;one_shot_prompt 用于兼容普通一次成片。'}
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
      scrubThirdPartyBrands(
        sanitizeStorefrontText(
          (s || "").toString().replace(/主播/g, "店员").replace(/直播间/g, "店里")
            .replace(/保真|保证升值|秒杀|限时抢|全网最低/g, ""),
          strictOpenFront,
        )
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
      dialogue: clean(sc?.dialogue, isTight15 ? 14 : (isViralStoreTour ? 16 : 60)),
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

    // 汉字计数(把中文标点也算作 0.5 字更贴近实际念稿节奏,这里简化只算汉字)
    const cnLen = (s: string) => (s || '').replace(/[^\u4e00-\u9fa5]/g, '').length;

    if (isTight15) {
      // === 15 秒严格模式:每段固定 3s,hook/outro 兜底,超预算按比例截中段 ===
      // 1) hook / outro 若为空,给一句短兜底,不允许空
      if (!script.hook.dialogue) script.hook.dialogue = '进来看看 ✨';
      if (!script.outro.dialogue) script.outro.dialogue = '感兴趣速冲';
      // 单条截到 8 字(hook/outro)
      const truncCn = (s: string, maxCn: number): string => {
        let cnt = 0; let out = '';
        for (const ch of s) {
          if (/[\u4e00-\u9fa5]/.test(ch)) {
            if (cnt >= maxCn) break;
            cnt++;
          }
          out += ch;
        }
        // 收尾修补句末
        if (out.length && !/[。!?！?…]$/.test(out)) {
          if (/[,,、]$/.test(out)) out = out.slice(0, -1);
        }
        return out.trim();
      };
      if (cnLen(script.hook.dialogue) > 8) script.hook.dialogue = truncCn(script.hook.dialogue, 8);
      if (cnLen(script.outro.dialogue) > 8) script.outro.dialogue = truncCn(script.outro.dialogue, 8);
      script.scenes.forEach((s: any) => {
        if (cnLen(s.dialogue) > 14) s.dialogue = truncCn(s.dialogue, 14);
      });

      // 2) 中段空 dialogue → 用 subtitle 或通用兜底填(严禁静默镜)
      const MID_FALLBACKS = ['这个真的绝', '店里都是好货', '闭眼冲不亏'];
      script.scenes.forEach((s: any, i: number) => {
        if (!s.dialogue || !s.dialogue.trim()) {
          const sub = (s.subtitle || '').toString().trim();
          s.dialogue = sub ? truncCn(sub, 14) : MID_FALLBACKS[i % MID_FALLBACKS.length];
        }
      });

      // 3) 总预算(60 字)超了 → 保 hook/outro,从中段最长的先削
      const budget = totalSpeakBudgetCn;
      const headTail = cnLen(script.hook.dialogue) + cnLen(script.outro.dialogue);
      let midBudget = Math.max(0, budget - headTail);
      let midSum = script.scenes.reduce((a: number, c: any) => a + cnLen(c.dialogue), 0);
      // 逐段按比例缩放
      if (midSum > midBudget && midSum > 0) {
        const k = midBudget / midSum;
        script.scenes.forEach((s: any) => {
          const target = Math.max(0, Math.floor(cnLen(s.dialogue) * k));
          if (cnLen(s.dialogue) > target) s.dialogue = truncCn(s.dialogue, target);
        });
      }

      // 4) 保证 3 段中段(补齐的段也必须"边演边说")
      const FILL_LINES = ['这个真的绝', '店里都是好货', '闭眼冲不亏'];
      while (script.scenes.length < 3) {
        const i = script.scenes.length;
        script.scenes.push({
          scene: script.hook.scene || '店内继续展示商品',
          action: '手持镜头顺移,店员边拿起一件商品边对镜头说',
          dialogue: FILL_LINES[i % FILL_LINES.length],
          subtitle: '',
          image_index: null,
          duration_s: 3,
          motion: '手持',
        });
      }
      script.scenes = script.scenes.slice(0, 3);


      // 4) duration 全部锁 3s
      script.hook.duration_s = 3;
      script.outro.duration_s = 3;
      script.scenes.forEach((s: any) => { s.duration_s = 3; });
      if (isViralStoreTour) script = bindSurpriseReferences(normalizeSurpriseScript(script), imageUrls.length);
    } else {
      // 非 15s:沿用旧的软目标 ±20% 浮动
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
    // one_shot_prompt:交给视频模型的一段话导演稿,做去敏 + 去分镜口令 + 截断
    {
      let osp = isViralStoreTour ? "" : (script?.one_shot_prompt ?? "").toString();
      osp = scrubThirdPartyBrands(sanitizeStorefrontText(osp, strictOpenFront))
        .replace(/主播/g, "店员").replace(/直播间/g, "店里")
        // 去掉模型可能偷偷带的分镜/时间码前缀
        .replace(/【[^】]{0,10}(镜头|开场|收尾|中段)[^】]{0,10}】/g, "")
        .replace(/\d+\s*[-–~到至]\s*\d+\s*秒/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 500);
      script.one_shot_prompt = osp;
    }
    script.image_urls = imageUrls;
    script.image_descriptions = imageDescriptions;
    script.topic = topic;
    script.intent = intent;
    script.style = styleKey;
    script.style_label = VIDEO_STYLE_LABELS[styleKey];
    // 标题:AI 给了就用,没给就从 topic 兜底,再兜底 rule.label
    {
      const rawTitle = (script?.title ?? "").toString();
      const cleaned = clean(rawTitle, 24).replace(/[「」『』"'\s]+$/g, "").trim();
      script.title = cleaned || (topic ? clean(topic, 14) : rule.label);
    }
    if (character) script.character = character;

    return json({ success: true, script, video_type: videoType, video_type_label: rule.label, __kb_sources: kbSourcesMeta(kbHits) });
  } catch (e) {
    console.error("[script] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

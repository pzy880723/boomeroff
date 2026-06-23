// 视频策划对话:店员和 AI 助理多轮沟通,弄清楚拍什么 / 想要什么感觉。
// 非流式,一次一轮返回一条简短回复。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_LABELS, VIDEO_STYLE_EN } from "../_shared/video-styles.ts";
import { loadMarketingPresets, type VideoType } from "../_shared/brand-context.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";

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
    const messages: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const ctx = body.context || {};
    const styleKey = normalizeStyle(ctx.style);
    const videoTypeKey: string = ctx.video_type || 'store_tour';
    const duration: number = Number(ctx.duration) || 15;
    const aspect: string = ctx.aspect || '9:16';
    const mode: 'chat' | 'draft_script' = body.mode === 'draft_script' ? 'draft_script' : 'chat';
    const imageDescriptions: { index: number; summary: string; best_for?: string }[] = Array.isArray(body.image_descriptions)
      ? body.image_descriptions.slice(0, 20)
      : [];

    const presets = await loadMarketingPresets();
    const rule = (presets.videoRules as any)[videoTypeKey] || presets.videoRules.store_tour;

    const shopId: string | null = typeof ctx.shop_id === "string" && ctx.shop_id ? ctx.shop_id : (typeof body.shop_id === "string" ? body.shop_id : null);
    const shopCtx = await loadShopContext(shopId);
    const shopBlock = formatShopContext(shopCtx);

    const imgBlock = imageDescriptions.length
      ? `\n店员已上传的参考图(共 ${imageDescriptions.length} 张):\n` +
        imageDescriptions.map((d) => `  [图 #${d.index}] ${d.summary}${d.best_for ? `(适合${d.best_for})` : ''}`).join('\n')
      : '\n(店员没有上传参考图)';

    const sysChat = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}${imgBlock}

你是 BOOMER·OFF 中古店「视频策划助理」,正在和店员对话,帮 ta 把这条短视频的拍摄要点聊清楚。

当前预设:
- 视频类型: ${rule.label} (${rule.scriptHint})
- 风格: ${VIDEO_STYLE_LABELS[styleKey]} (${VIDEO_STYLE_EN[styleKey]})
- 时长: ${duration} 秒
- 画幅: ${aspect}

对话目标:摸清以下几点,缺什么问什么,一次最多追问 1 个问题。
1) 主要拍什么(具体商品 / 区域 / 事件 / 季节感)
2) 想给观众什么感觉、希望他们看完做什么
3) 有没有特别想入镜的画面或细节
4) 有没有不想拍到的东西(禁忌)

**严格输出 JSON**(不要任何额外文字、不要 Markdown 代码块包裹),格式:
{"reply":"一句问话(≤40字,口语化,称呼用你)","options":["选项A","选项B","选项C","其他(我自己说)"],"done":false}

选项铁律:
- 每轮 reply 只问 1 个问题,options 给 2-4 个可点选项,每个 ≤ 12 字,口语化、互斥、覆盖店员最常见的答案。
- options 最后一项**总是**「其他(我自己说)」,让店员可以打字。
- 已经答过的维度不再追问,要顺着上一轮的回答深入或换下一个维度。
- 不要直接输出分镜或脚本(脚本由后续步骤生成)。
- 绝不用"主播""宝宝们"等违禁词。
- 当信息够拍了:reply 写 "我觉得够了,你可以点上面的『让 AI 写一版完整脚本』。",options 给 [],done 设为 true。`;

    const midCount = Math.max(1, Math.round(duration / 2.5) - 2);  // 15→4, 20→6, 30→10
    const wordsLo = Math.round(duration * 12);   // 15→180, 30→360
    const wordsHi = Math.round(duration * 18);   // 15→270, 30→540
    const sysDraft = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}${imgBlock}

你是 BOOMER·OFF 中古店「视频脚本作者」。基于上面跟店员的对话和参考图描述,直接输出一版**完整的口语化叙事脚本**给店员看。

当前预设:类型 ${rule.label} · 风格 ${VIDEO_STYLE_LABELS[styleKey]} · 时长 ${duration} 秒 · 画幅 ${aspect}。

输出格式(纯文本,不用 Markdown 标题):
开场(约2秒):一段话,描述画面感觉+第一句台词/字幕。[图 #N]
中段1(约X秒):...[图 #N]
中段2(约X秒):...[图 #N]
(根据时长写 ${midCount} 段中段,可上下浮动 1 段)
收尾(约2秒):升华或行动召唤+落版字幕。[图 #N]

铁律:
- 全文 ${wordsLo}-${wordsHi} 字,口语化,像跟同事讲怎么拍这条片子。时长越长段数越多、内容越细。
- **每一段结尾必须用 [图 #N] 标注它对应哪张参考图**(N 是 0 起的 index,只能从店员实际上传的那几张里挑;没有参考图就一律写 [无图])。
- 同一张图不要连续用两段。
- 称呼用"你",绝不用"主播""宝宝们""保真""限时抢"等违禁词。
- 不要列分镜表格,就是一段一段顺着讲。`;

    const sys = mode === 'draft_script' ? sysDraft : sysChat;

    const lastUserExtra = mode === 'draft_script'
      ? [{ role: 'user' as const, content: '请基于上面的对话和参考图,现在就给我写一版完整脚本。' }]
      : [];

    const chat = [
      { role: 'system', content: sys },
      ...messages.map((m) => ({ role: m.role, content: (m.content || '').toString().slice(0, 1000) })),
      ...lastUserExtra,
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: chat,
        temperature: mode === 'draft_script' ? 0.85 : 0.7,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[brief-chat] AI", aiRes.status, t.slice(0, 400));
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      if (aiRes.status === 429) return json({ error: "AI 限流,请稍后" }, 429);
      return json({ error: "AI 回复失败" }, 500);
    }
    const data = await aiRes.json();
    const maxLen = mode === 'draft_script' ? 1200 : 280;
    const reply: string = (data?.choices?.[0]?.message?.content || "").toString().trim().slice(0, maxLen);
    return json({ success: true, reply, mode });
  } catch (e) {
    console.error("[brief-chat] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

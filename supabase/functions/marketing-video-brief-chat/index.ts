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

    const presets = await loadMarketingPresets();
    const rule = (presets.videoRules as any)[videoTypeKey] || presets.videoRules.store_tour;

    const shopId: string | null = typeof ctx.shop_id === "string" && ctx.shop_id ? ctx.shop_id : (typeof body.shop_id === "string" ? body.shop_id : null);
    const shopCtx = await loadShopContext(shopId);
    const shopBlock = formatShopContext(shopCtx);

    const sys = `${presets.brand}
${shopBlock ? `\n${shopBlock}\n` : ""}

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

铁律:
- 每次回复 ≤ 60 字,口语化,像同事讨论,不要列表不要 emoji。
- 不要直接输出分镜或脚本(脚本由后续步骤生成)。
- 称呼用"你",绝不用"主播""宝宝们"。
- 当信息够拍了,主动说一句:"我觉得够了,你可以点上面的『生成分镜』。"`;

    const chat = [
      { role: 'system', content: sys },
      ...messages.map((m) => ({ role: m.role, content: (m.content || '').toString().slice(0, 1000) })),
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: chat,
        temperature: 0.7,
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
    const reply: string = (data?.choices?.[0]?.message?.content || "").toString().trim().slice(0, 280);
    return json({ success: true, reply });
  } catch (e) {
    console.error("[brief-chat] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

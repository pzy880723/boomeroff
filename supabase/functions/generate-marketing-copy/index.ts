// 看图写文：1–9 张图 → 选平台 + 口吻 → 3 条候选(标题+正文+话题+首评)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BRAND_SYSTEM_PROMPT } from "../_shared/brand-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Platform = "xhs" | "douyin" | "shipinhao" | "pyq";
type Tone = "种草" | "探店" | "藏家分享" | "上新";

const PLATFORM_BRIEF: Record<Platform, string> = {
  xhs: "小红书：标题 ≤20 字带钩子和 emoji，正文 150–220 字、分 3–4 短段，结尾留一句行动召唤；3–6 个 # 话题标签。",
  douyin: "抖音：标题 ≤20 字、口语化制造悬念；正文 80–140 字偏口播稿，分句短、便于读字幕；2–5 个 # 话题。",
  shipinhao: "视频号：标题 ≤22 字稳一点，正文 100–180 字克制有质感，2–4 个 # 话题。",
  pyq: "朋友圈：不要标题，只输出 1–3 段短文，几乎不用 emoji，像随手记，结尾不喊话；不要 # 话题。",
};

const TONE_BRIEF: Record<Tone, string> = {
  种草: "用第一人称'我'，描述偶遇/被打中的感觉，不写商品介绍。",
  探店: "用第一人称'我'，写从进店到翻筐的过程感，强调店里东西多/有意思。",
  藏家分享: "半专业口吻，先点物件名/品牌/年代/工艺（仅限提供的事实），再讲为什么动心。",
  上新: "第三人称店铺口吻，告诉粉丝新到了什么类型的一件好物，不夸张。",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const imageUrls: string[] = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 9) : [];
    const platform: Platform = ["xhs", "douyin", "shipinhao", "pyq"].includes(body.platform) ? body.platform : "xhs";
    const tone: Tone = ["种草", "探店", "藏家分享", "上新"].includes(body.tone) ? body.tone : "种草";
    const productName = (body.product_name || "").toString().trim().slice(0, 40);
    const price = (body.price || "").toString().trim().slice(0, 20);
    const highlight = (body.highlight || "").toString().trim().slice(0, 80);
    if (!imageUrls.length) return json({ error: "至少上传一张图" }, 400);

    const sys = `${BRAND_SYSTEM_PROMPT}

平台：${PLATFORM_BRIEF[platform]}
口吻：${TONE_BRIEF[tone]}

输出格式：严格 JSON 数组，3 个对象，每个对象字段：
{
  "title": "标题（朋友圈留空字符串）",
  "body": "正文，可含 \\n",
  "hashtags": ["#标签1", "#标签2"],
  "first_comment": "可选首评建议（朋友圈留空字符串）"
}
只返回 JSON 数组，不要任何前后文字、不要 \`\`\`json 包裹。`;

    const userMsg: any[] = [
      { type: "text", text: [
        `店员提供的事实（不要编造其它）：`,
        productName ? `- 商品名：${productName}` : "",
        price ? `- 价格：${price}` : "",
        highlight ? `- 想突出的点：${highlight}` : "",
        `请基于图片和上面的事实，输出 3 条不同写法的候选。`,
      ].filter(Boolean).join("\n") },
      ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        temperature: 0.9,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[copy] AI", aiRes.status, t.slice(0, 400));
      if (aiRes.status === 429) return json({ error: "AI 限流，请稍后" }, 429);
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      return json({ error: "AI 生成失败" }, 500);
    }
    const data = await aiRes.json();
    let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) raw = m[0];
    let candidates: any[] = [];
    try { candidates = JSON.parse(raw); } catch { /* */ }
    if (!Array.isArray(candidates) || !candidates.length) {
      return json({ error: "AI 返回格式异常" }, 500);
    }
    // 清洗禁用词
    const sanitize = (s: string) =>
      (s || "")
        .replace(/主播/g, "店员")
        .replace(/直播间/g, "店里")
        .replace(/保真|保证升值|秒杀|限时抢|全网最低|拍卖行级别/g, "")
        .trim();
    candidates = candidates.slice(0, 3).map((c) => ({
      title: sanitize(c?.title || ""),
      body: sanitize(c?.body || ""),
      hashtags: Array.isArray(c?.hashtags) ? c.hashtags.map((x: any) => sanitize(String(x))).filter(Boolean).slice(0, 8) : [],
      first_comment: sanitize(c?.first_comment || ""),
    }));

    // 落库
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: row } = await admin.from("marketing_assets").insert({
      user_id: u.user.id,
      kind: "copy",
      input_image_urls: imageUrls,
      output_text: JSON.stringify(candidates),
      meta: { platform, tone, product_name: productName, price, highlight },
    }).select().single();

    return json({ success: true, candidates, asset_id: row?.id });
  } catch (e) {
    console.error("[copy] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

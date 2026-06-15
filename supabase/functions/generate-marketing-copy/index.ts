// 看图写文：1–9 张图 → 选平台 + 口吻 → 3 条候选(标题+正文+话题+首评)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadMarketingPresets } from "../_shared/brand-context.ts";

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
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const presets = await loadMarketingPresets();

    const body = await req.json().catch(() => ({}));
    const imageUrls: string[] = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 9) : [];
    const platformKey: string = Object.keys(presets.platforms).includes(body.platform) ? body.platform : "xhs";
    const toneKey: string = Object.keys(presets.tones).includes(body.tone) ? body.tone : "种草";
    const productName = (body.product_name || "").toString().trim().slice(0, 40);
    const price = (body.price || "").toString().trim().slice(0, 20);
    const highlight = (body.highlight || "").toString().trim().slice(0, 80);
    if (!imageUrls.length) return json({ error: "至少上传一张图" }, 400);

    const sys = `${presets.brand}

平台：${presets.platforms[platformKey]}
口吻：${presets.tones[toneKey]}

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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: row } = await admin.from("marketing_assets").insert({
      user_id: u.user.id,
      kind: "copy",
      input_image_urls: imageUrls,
      output_text: JSON.stringify(candidates),
      meta: { platform: platformKey, tone: toneKey, product_name: productName, price, highlight },
    }).select().single();

    return json({ success: true, candidates, asset_id: row?.id });
  } catch (e) {
    console.error("[copy] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

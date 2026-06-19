// 用自然语言一段话生成店铺营销画像（tagline / description / selling_points 等）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const text = (body.text || "").toString().trim().slice(0, 2000);
    const shopId = (body.shop_id || "").toString();
    if (!text) return json({ error: "请先输入一段店铺描述" }, 400);

    // 取店铺基础信息辅助生成
    let shopName = ""; let shopAddress = "";
    if (shopId) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const { data: shop } = await admin.from("shops").select("name, address").eq("id", shopId).maybeSingle();
      shopName = (shop as any)?.name || "";
      shopAddress = (shop as any)?.address || "";
    }

    const sys = `你是 BOOMER 中古杂货品牌的营销助理。根据店员用自然语言写的店铺介绍，提炼成结构化的「店铺营销画像」，用于后续 AI 生成图/文/视频。
要求：
- 全部输出简体中文，符合日本中古杂货/二手店的氛围
- 措辞克制、有质感，避免浮夸营销词
- 严格只输出 JSON 对象，不要任何前后文字、不要 \`\`\`json 包裹

JSON 字段（全部必填，缺失就给合理推断的空字符串/空数组）：
{
  "tagline": "一句话定位，≤30 字",
  "description": "店铺详细介绍，80-200 字，自然成段",
  "selling_points": ["核心卖点", "..."]   // 3-6 条，每条 ≤20 字
  ,"tone": "偏好口吻，2-6 字，如：治愈 / 克制 / 偶遇感",
  "target_audience": "目标人群，20-60 字",
  "brand_keywords": ["关键词", "..."]   // 4-8 个，每个 2-6 字
  ,"default_hashtags": ["#标签", "..."]  // 3-6 个，含 # 号
}`;

    const userMsg = [
      shopName ? `门店名：${shopName}` : "",
      shopAddress ? `地址：${shopAddress}` : "",
      "",
      "店员描述：",
      text,
    ].filter(Boolean).join("\n");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 429) return json({ error: "请求过于频繁，请稍后再试" }, 429);
      if (r.status === 402) return json({ error: "AI 额度不足，请联系管理员充值" }, 402);
      return json({ error: `AI 调用失败：${t.slice(0, 200)}` }, 500);
    }
    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let profile: any = {};
    try { profile = JSON.parse(raw); } catch { profile = {}; }

    // 兜底/清洗
    const clean = (v: any, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const cleanArr = (v: any, n: number, max: number) =>
      Array.isArray(v) ? v.map((x) => typeof x === "string" ? x.trim().slice(0, max) : "").filter(Boolean).slice(0, n) : [];

    const out = {
      tagline: clean(profile.tagline, 40),
      description: clean(profile.description, 500),
      selling_points: cleanArr(profile.selling_points, 6, 30),
      tone: clean(profile.tone, 20),
      target_audience: clean(profile.target_audience, 120),
      brand_keywords: cleanArr(profile.brand_keywords, 8, 12),
      default_hashtags: cleanArr(profile.default_hashtags, 6, 20).map((x: string) => x.startsWith("#") ? x : `#${x}`),
    };

    return json({ profile: out });
  } catch (e: any) {
    console.error("[generate-shop-profile] error", e);
    return json({ error: e?.message || "服务异常" }, 500);
  }
});

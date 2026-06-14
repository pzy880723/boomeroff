// 素材充分性分析：对每张图打标镜位，对比该视频类型的"必备镜位"，
// 返回 sufficiency = ok | partial | insufficient，以及补拍清单。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { VIDEO_TYPE_RULES, VIDEO_TYPE_LABEL, type VideoType } from "../_shared/brand-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// 所有 slot 的完整集合，给 AI 选择
const ALL_SLOTS = [
  "storefront", "wide_interior", "shelf_display", "rummage_bin",
  "product_front", "product_detail", "product_scene", "product_angle", "product_hand", "product_tag",
  "staff", "visitor", "lighting", "street", "other",
];

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
    if (!imageUrls.length) return json({ error: "请先上传素材" }, 400);

    const rule = VIDEO_TYPE_RULES[videoType];
    const sys = `你是中古店铺视频导演助理。对店员上传的素材逐张打标。
镜位字典（必须从中选一个最贴近的标签）：
- storefront: 门头/店铺入口/招牌
- wide_interior: 店内广角全景
- shelf_display: 货架陈列特写或中景
- rummage_bin: 翻筐区、筐内俯拍
- product_front: 单件商品的正面/主图
- product_detail: 商品材质、印记、做工微距
- product_scene: 商品在货架或在手中的场景
- product_angle: 同一商品的侧/背/斜角
- product_hand: 手持把玩
- product_tag: 价签、标签
- staff: 店员（不一定正脸）
- visitor: 顾客剪影/背影
- lighting: 灯光、霓虹、氛围光
- street: 店外街景
- other: 都不沾边

输出严格 JSON：
{
  "images": [
    { "index": 0, "slot": "<上面字典里的 key>", "subject": "<店铺|商品|人|环境>", "quality": "<good|blurry|underexposed|low_quality>", "note": "<≤15 字解释>" },
    ...
  ]
}
只输出 JSON，不要任何 \`\`\` 包裹。`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: [
            { type: "text", text: `共 ${imageUrls.length} 张，按顺序给出 index 从 0 开始的打标。目标视频类型：${VIDEO_TYPE_LABEL[videoType]}。` },
            ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
          ] },
        ],
        temperature: 0.2,
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[analyze] AI", aiRes.status, t.slice(0, 400));
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      if (aiRes.status === 429) return json({ error: "AI 限流，请稍后" }, 429);
      return json({ error: "AI 分析失败" }, 500);
    }
    const data = await aiRes.json();
    let raw: string = (data?.choices?.[0]?.message?.content || "").toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { /* */ }
    const labels: Array<{ index: number; slot: string; subject: string; quality: string; note: string }> =
      Array.isArray(parsed?.images) ? parsed.images : [];

    // 统计每个 slot 的"可用"张数（quality !== low_quality && blurry）
    const usable = labels.filter((x) => x.quality === "good" || x.quality === "underexposed");
    const slotCount: Record<string, number> = {};
    for (const x of usable) {
      const slot = ALL_SLOTS.includes(x.slot) ? x.slot : "other";
      slotCount[slot] = (slotCount[slot] || 0) + 1;
    }

    // 比对规则
    const required = rule.required.map((r) => ({
      ...r,
      have: slotCount[r.slot] || 0,
      ok: (slotCount[r.slot] || 0) >= r.minCount,
    }));
    const recommended = rule.recommended.map((r) => ({
      ...r,
      have: slotCount[r.slot] || 0,
      ok: (slotCount[r.slot] || 0) >= 1,
    }));

    const missingRequired = required.filter((r) => !r.ok);
    const missingRecommended = recommended.filter((r) => !r.ok);
    let sufficiency: "ok" | "partial" | "insufficient";
    if (missingRequired.length === 0) sufficiency = "ok";
    else if (missingRequired.length * 2 >= required.length) sufficiency = "insufficient";
    else sufficiency = "partial";

    return json({
      success: true,
      sufficiency,
      labels,
      required,
      recommended,
      missing_required: missingRequired,
      missing_recommended: missingRecommended,
      video_type: videoType,
      video_type_label: VIDEO_TYPE_LABEL[videoType],
    });
  } catch (e) {
    console.error("[analyze] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

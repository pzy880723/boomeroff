// 图片"修复型"优化：店员随手拍 → 正常质感。
// 明确不做：风格化、换背景、加贴纸/水印、美颜、改商品本体。
// 模型：google/gemini-3.1-flash-image-preview（Nano Banana 2，擅长保留主体的轻量编辑）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface FixToggles {
  exposure?: boolean;          // 曝光与白平衡
  geometry?: boolean;          // 去畸变 / 扶正
  denoise?: boolean;           // 降噪 + 微锐化
  declutter?: boolean;         // 去杂物
  bg_clean?: boolean;          // 背景净化（默认关）
}

function buildFixPrompt(toggles: FixToggles, custom?: string): string {
  const fixes: string[] = [];
  if (toggles.exposure !== false) fixes.push("修正曝光和白平衡：如果原图欠曝就轻度提亮，过曝就压回；色温偏冷或偏黄都归到中性自然。");
  if (toggles.geometry !== false) fixes.push("修正轻微镜头畸变和轻微倾斜，让画面横平竖直；不裁切主体。");
  if (toggles.denoise !== false) fixes.push("降低弱光下的噪点，并做非常轻度的锐化以保留材质纹理；不要做磨皮或过度平滑。");
  if (toggles.declutter !== false) fixes.push("只去除画面里明显干扰的杂物：店员的手、抹布、空塑料袋、临时贴的价签、垃圾。不要修改商品本体、Logo、文字、形状或材质。");
  if (toggles.bg_clean) fixes.push("对杂乱的背景做轻度模糊或色调统一，让主体更突出；绝不替换背景。");

  const must = [
    "保留照片的真实感和质感，输出仍然像店员当场拍的照片，只是更通透一点。",
    "禁止做任何风格化：不要胶片颗粒、不要日系滤镜、不要小清新、不要杂志感、不要 HDR。",
    "禁止换背景、加贴纸、加水印、加文字、加边框。",
    "禁止改变商品本体的颜色、形状、材质、Logo 和文字。",
    "禁止做美颜、瘦脸、磨皮。",
    "输出尺寸与原图一致。",
  ];

  return [
    "对这张照片做以下修复（只做修复，不做风格化）：",
    ...fixes.map((s, i) => `${i + 1}. ${s}`),
    custom ? `\n额外要求：${custom}` : "",
    "\n硬性约束：",
    ...must.map((s) => `- ${s}`),
  ].join("\n");
}

async function urlToDataUrl(url: string): Promise<string> {
  // 直接转发 https URL 给模型也可以，但有些 URL 鉴权失败，统一拉下来转 base64 更稳。
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed: ${r.status}`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return `data:${ct};base64,${btoa(bin)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const user = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await user.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const imageUrl: string = body.image_url || "";
    const toggles: FixToggles = body.toggles || {};
    const custom: string = (body.custom || "").toString().slice(0, 200);
    if (!imageUrl) return json({ error: "缺少 image_url" }, 400);

    // 每天 30 张/人 软上限
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const today = new Date().toISOString().slice(0, 10);
    const { count: usedToday } = await admin
      .from("marketing_assets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.user.id)
      .eq("kind", "photo")
      .gte("created_at", `${today}T00:00:00Z`);
    if ((usedToday || 0) >= 30) {
      return json({ error: "今日图片优化次数已达 30 张，明天再来吧" }, 429);
    }

    const prompt = buildFixPrompt(toggles, custom);
    const dataUrl = await urlToDataUrl(imageUrl);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[beautify] AI error", aiRes.status, t.slice(0, 500));
      if (aiRes.status === 429) return json({ error: "AI 限流，请稍后再试" }, 429);
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      return json({ error: "AI 生成失败" }, 500);
    }
    const aiJson = await aiRes.json();
    const url: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !url.startsWith("data:image")) {
      console.error("[beautify] no image", JSON.stringify(aiJson).slice(0, 400));
      return json({ error: "AI 未返回图片" }, 500);
    }

    const m = url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return json({ error: "图片格式异常" }, 500);
    const mime = m[1];
    const ext = mime.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const path = `${u.user.id}/beautified-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("product-images").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (upErr) {
      console.error("[beautify] upload error", upErr);
      return json({ error: "上传失败" }, 500);
    }
    const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);

    // 落到 marketing_assets
    const shopId: string | null = typeof body.shop_id === "string" && body.shop_id ? body.shop_id : null;
    const { data: row } = await admin.from("marketing_assets").insert({
      user_id: u.user.id,
      kind: "photo",
      shop_id: shopId,
      input_image_urls: [imageUrl],
      output_url: pub.publicUrl,
      meta: { toggles, custom: custom || null },
    }).select().single();

    return json({ success: true, output_url: pub.publicUrl, asset_id: row?.id });
  } catch (e) {
    console.error("[beautify] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

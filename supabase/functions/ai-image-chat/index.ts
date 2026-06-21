// AI 图片 · 对话式生成/编辑
// 一个端点搞定:文生图 / 图生图(1张) / 多图融合(2-4张) / 模板模式
// 模型固定 google/gemini-3.1-flash-image-preview (Nano Banana 2)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Aspect = "1:1" | "3:4" | "9:16" | "16:9";

const ASPECT_HINT: Record<Aspect, string> = {
  "1:1": "输出画面比例 1:1(正方形)",
  "3:4": "输出画面比例 3:4(竖向,适合小红书/海报)",
  "9:16": "输出画面比例 9:16(手机竖屏,适合朋友圈封面)",
  "16:9": "输出画面比例 16:9(横向)",
};

// 模板:前端只传 template_id + fields,后端拼最终 prompt
type TemplateFn = (fields: Record<string, string>) => string;
const TEMPLATES: Record<string, TemplateFn> = {
  // ===== 商品海报 =====
  "product-vintage-film": (f) =>
    `把参考图里的商品做成一张中古胶片质感的单品海报:背景米色或浅卡其,自然光,轻微胶片颗粒,商品居中略偏上。${f.name ? `画面右下角竖排手写体小字"${f.name}"。` : ""}${f.price ? `下方价格标签"¥${f.price}"。` : ""}${f.point ? `左下角一句话卖点"${f.point}",字号要小。` : ""}整体安静、复古、不喧宾夺主。`,
  "product-natural-light": (f) =>
    `把参考图里的商品做成日杂自然光风格的单品图:浅木色或亚麻布背景,侧逆光,有自然光斑,商品质感真实。${f.name ? `右上角小字标题"${f.name}"。` : ""}${f.price ? `角落写价格"¥${f.price}"。` : ""}${f.point ? `配一句话文案"${f.point}"。` : ""}轻松、温柔、像日系杂志内页。`,
  "product-minimal-white": (f) =>
    `把参考图里的商品做成极简白底海报:纯白或极浅灰背景,商品居中,投影柔和。${f.name ? `顶部黑色无衬线标题"${f.name}"。` : ""}${f.price ? `右下角大字价格"¥${f.price}",带"¥"符号。` : ""}${f.point ? `底部一行小字"${f.point}"。` : ""}极简、克制、像 MUJI。`,

  // ===== 活动/促销海报 =====
  "promo-weekend-sale": (f) =>
    `做一张周末特卖海报,主视觉用参考图里的商品。背景偏暖色(米黄/淡橘),顶部大字"周末特卖"。${f.subtitle ? `副标题"${f.subtitle}"。` : ""}${f.discount ? `醒目折扣徽章"${f.discount}"。` : ""}${f.dates ? `底部时间"${f.dates}"。` : ""}活泼但不廉价,带轻微复古海报感。`,
  "promo-new-arrival": (f) =>
    `做一张"新到货"上新海报,主视觉用参考图里的商品。顶部大字"NEW IN / 新到货"。${f.subtitle ? `副标题"${f.subtitle}"。` : ""}${f.dates ? `角落小字"${f.dates}"。` : ""}背景干净,商品突出,像精品店上新公告。`,
  "promo-clearance": (f) =>
    `做一张清仓海报,主视觉用参考图里的商品。背景大色块红或深棕,顶部大字"最后三天 · 清仓"。${f.discount ? `醒目折扣"${f.discount}"。` : ""}${f.subtitle ? `副标题"${f.subtitle}"。` : ""}有紧迫感但保留中古店调性,不要做成大卖场风。`,

  // ===== 朋友圈/小红书封面 =====
  "cover-weekly-pick": (f) =>
    `做一张 9:16 朋友圈封面,九宫格风格,用参考图里的商品做主视觉拼贴。顶部大字"本周精选"。${f.subtitle ? `副标题"${f.subtitle}"。` : ""}米色或浅灰背景,整体克制有质感。`,
  "cover-hero-product": (f) =>
    `做一张 9:16 单品大字报封面,参考图里的商品大幅居中。顶部或底部大字"${f.title || "本期主角"}"。${f.subtitle ? `副标题小字"${f.subtitle}"。` : ""}字号要够大,适合手机刷到三秒就被吸引。`,
  "cover-store-vibe": (f) =>
    `做一张 9:16 店内氛围封面,用参考图当主视觉,营造出"想走进来逛一逛"的感觉。${f.title ? `顶部大字标题"${f.title}"。` : ""}${f.subtitle ? `底部小字"${f.subtitle}"。` : ""}光线温暖,有生活气。`,
};

function buildPrompt(opts: {
  userPrompt: string;
  aspect: Aspect;
  refsCount: number;
  templateId?: string;
  templateFields?: Record<string, string>;
}): string {
  const parts: string[] = [];

  if (opts.templateId && TEMPLATES[opts.templateId]) {
    parts.push(TEMPLATES[opts.templateId](opts.templateFields || {}));
  }

  if (opts.userPrompt?.trim()) {
    // 把 @img1 @img2 替换成自然语言
    const replaced = opts.userPrompt.replace(/@img(\d+)/g, (_, n) => `参考图${n}`);
    parts.push(replaced);
  }

  if (opts.refsCount === 0 && !opts.templateId) {
    parts.push("这是一张从零生成的图,没有参考图。");
  } else if (opts.refsCount === 1) {
    parts.push("保留参考图里商品/主体的真实形状、颜色、材质、Logo 和文字,不要改商品本体。");
  } else if (opts.refsCount > 1) {
    parts.push(`一共 ${opts.refsCount} 张参考图,按描述把它们的元素融合到一张图里。每张图里商品/人物的本体形状、颜色、材质、Logo 和文字不要改。`);
  }

  parts.push(ASPECT_HINT[opts.aspect]);
  parts.push("不要加水印、不要加二维码、不要加无关文字。");

  return parts.filter(Boolean).join("\n\n");
}

async function urlToDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed: ${r.status}`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
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
    const userPrompt: string = (body.prompt || "").toString().slice(0, 1500);
    const aspect: Aspect = (["1:1", "3:4", "9:16", "16:9"].includes(body.aspect) ? body.aspect : "1:1") as Aspect;
    const refs: string[] = Array.isArray(body.refs) ? body.refs.slice(0, 4).filter((x: any) => typeof x === "string") : [];
    const templateId: string | undefined = typeof body.template_id === "string" ? body.template_id : undefined;
    const templateFields: Record<string, string> = (body.template_fields && typeof body.template_fields === "object") ? body.template_fields : {};
    const shopId: string | null = typeof body.shop_id === "string" && body.shop_id ? body.shop_id : null;

    if (!userPrompt.trim() && !templateId) {
      return json({ ok: false, error: "请输入想要的画面描述" }, 200);
    }

    // 每日 50 张软上限
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const today = new Date().toISOString().slice(0, 10);
    const { count: usedToday } = await admin
      .from("marketing_assets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.user.id)
      .eq("kind", "photo")
      .gte("created_at", `${today}T00:00:00Z`);
    if ((usedToday || 0) >= 50) {
      return json({ ok: false, error: "今日 AI 图片次数已达 50 张,明天再来吧" }, 200);
    }

    const finalPrompt = buildPrompt({ userPrompt, aspect, refsCount: refs.length, templateId, templateFields });

    // 拼 multipart content
    const content: any[] = [{ type: "text", text: finalPrompt }];
    for (const url of refs) {
      try {
        const dataUrl = await urlToDataUrl(url);
        content.push({ type: "image_url", image_url: { url: dataUrl } });
      } catch (e) {
        console.warn("[ai-image-chat] ref fetch failed", url, e);
      }
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[ai-image-chat] AI error", aiRes.status, t.slice(0, 500));
      if (aiRes.status === 429) return json({ ok: false, error: "AI 限流,请稍后再试" }, 200);
      if (aiRes.status === 402) return json({ ok: false, error: "AI 额度已用尽,请联系管理员充值" }, 200);
      return json({ ok: false, error: "AI 生成失败,请换个描述再试" }, 200);
    }
    const aiJson = await aiRes.json();
    const imageUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl || !imageUrl.startsWith("data:image")) {
      console.error("[ai-image-chat] no image", JSON.stringify(aiJson).slice(0, 400));
      return json({ ok: false, error: "AI 没返回图片,可能描述太复杂或被内容策略挡了,换个说法试试" }, 200);
    }

    const m = imageUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return json({ ok: false, error: "图片格式异常" }, 200);
    const mime = m[1];
    const ext = mime.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const path = `${u.user.id}/ai-image-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("product-images").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (upErr) {
      console.error("[ai-image-chat] upload error", upErr);
      return json({ ok: false, error: "上传失败" }, 200);
    }
    const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);

    const { data: row } = await admin.from("marketing_assets").insert({
      user_id: u.user.id,
      kind: "photo",
      shop_id: shopId,
      input_image_urls: refs,
      output_url: pub.publicUrl,
      meta: {
        mode: refs.length === 0 ? "text2img" : refs.length === 1 ? "img2img" : "multi",
        prompt: userPrompt || null,
        aspect,
        template_id: templateId || null,
        template_fields: templateId ? templateFields : null,
      },
    }).select().single();

    return json({ ok: true, output_url: pub.publicUrl, asset_id: row?.id });
  } catch (e) {
    console.error("[ai-image-chat] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" }, 200);
  }
});

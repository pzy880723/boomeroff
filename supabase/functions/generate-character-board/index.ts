// 生成"角色身份板"图。
// 使用 Gemini Nano Banana 2 (google/gemini-3.1-flash-image-preview) 通过 chat-completions image 形状调用。
// 上传产物到 marketing-videos bucket 下 characters/{shop_id}/{id}.png,并落 marketing_characters 一条记录。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TEMPLATE = `创建一张艺术性的16:9角色身份板 [主体]:使用参考图像 纯白色/柔和的米白色背景。
无环境、无道具、无标志、无水印。
设计方向:不要创建标准的角色参考表。创建一张电影般的身份板,感觉像是高端动画工作室的角色研究与艺术书布局的结合。
布局应不对称、优雅且视觉上令人难忘. 使用大片留白、多样化的图像比例和有意的不平衡。
避免网格、蓝图设计、目录布局和重复的转场展示。
重要布局规则:不要重叠任何角色图像。每个视角必须有清晰的分离和呼吸空间。保持所有身体、肖像、轮廓和细节研究的视觉区分。无裁剪面部、无隐藏肢体、无堆叠人物、无合并姿势。
主要构图:放置一个大型英雄全身视角,略微偏离中心作为视觉锚点。
围绕它,以干净的间距排列较小的辅助研究:中性全身视角、背面视角、侧面视角、坐姿、倾斜姿势、蹲姿、俯视身体角度、仰视身体角度、富有表现力的肖像研究。
每个视角应感觉像是一个独立的干净角色研究,而不是来自一个场景的帧。
身份锁定:在所有视角中保持严格的身份一致性:相同面部、相同面部比例、相同发型、相同服装、相同身体比例、相同姿势语言、相同视觉个性。
有用参考细节:使角色便于未来的图像和视频生成:清晰的面部形状、清晰的发型轮廓、清晰的服装轮廓、清晰的身体形状、清晰的手部、清晰的姿势、清晰的表情范围。
艺术性部分:包含一个小轮廓研究区域,带有2-3个简化的黑色角色轮廓。包含一个小表情研究区域,带有细微的情感变化,包含一个小细节研究区域,展示面部、头发和服装的关键视觉特征。
文本设计:添加一个时尚的角色ID块。保持简约、大胆且艺术导向。仅使用:名称 角色核心情绪 视觉标志
仅在有帮助的地方使用小型手写风格标签。允许使用细微的编辑箭头和标注标记,但保持简约和优雅。
风格:简约、电影感、高端、艺术书般、干净、富有表现力、适用于制作。
最终图像应感觉像一张艺术性的角色身份板,旨在帮助AI模型理解角色的面部、轮廓、服装、姿势和情感范围。`;

function buildSubjectBlock(name: string, role_label?: string, extra_desc?: string, core_emotion?: string, visual_signature?: string): string {
  const lines: string[] = [];
  lines.push(`主体角色名称：${name}`);
  if (role_label) lines.push(`角色定位：${role_label}`);
  if (core_emotion) lines.push(`核心情绪：${core_emotion}`);
  if (visual_signature) lines.push(`视觉标志：${visual_signature}`);
  if (extra_desc) lines.push(`其他描述：${extra_desc}`);
  return lines.join('\n');
}

async function generateBoardImage(opts: {
  apiKey: string;
  subjectBlock: string;
  refImageUrls: string[];
}): Promise<string> {
  // 使用 OpenRouter chat-completions image shape (Gemini)
  const content: any[] = [
    { type: "text", text: `${opts.subjectBlock}\n\n${TEMPLATE}` },
  ];
  for (const url of opts.refImageUrls.slice(0, 4)) {
    content.push({ type: "image_url", image_url: { url } });
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI 图像生成失败 ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  // 兼容多种响应形态：images[0].image_url.url 或 message.images[0]
  const msg = data?.choices?.[0]?.message;
  const imgs: any[] = msg?.images || [];
  let url: string | undefined;
  if (imgs[0]?.image_url?.url) url = imgs[0].image_url.url;
  else if (typeof imgs[0] === "string") url = imgs[0];
  else if (data?.data?.[0]?.b64_json) url = `data:image/png;base64,${data.data[0].b64_json}`;
  if (!url) throw new Error("AI 未返回图片");
  return url;
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  if (dataUrl.startsWith("data:")) {
    const base64 = dataUrl.split(",", 2)[1] || "";
    const bin = atob(base64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }
  const r = await fetch(dataUrl);
  return new Uint8Array(await r.arrayBuffer());
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
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const shop_id: string | null = body.shop_id || null;
    if (!shop_id) return json({ error: "缺少 shop_id" }, 400);
    const name = (body.name || "").toString().trim().slice(0, 40);
    if (!name) return json({ error: "请填写角色名称" }, 400);
    const role_label = (body.role_label || "").toString().trim().slice(0, 20);
    const extra_desc = (body.extra_desc || "").toString().trim().slice(0, 400);
    const core_emotion = (body.core_emotion || "").toString().trim().slice(0, 30);
    const visual_signature = (body.visual_signature || "").toString().trim().slice(0, 80);
    const subject_image_urls: string[] = Array.isArray(body.subject_image_urls)
      ? body.subject_image_urls.filter((s: any) => typeof s === "string").slice(0, 4)
      : [];
    const autoAnchor = !!body.auto_anchor;
    const metaExtra = (body.meta && typeof body.meta === "object") ? body.meta : {};

    const subjectBlock = buildSubjectBlock(name, role_label, extra_desc, core_emotion, visual_signature);

    const imgDataUrl = await generateBoardImage({
      apiKey: LOVABLE_API_KEY,
      subjectBlock,
      refImageUrls: subject_image_urls,
    });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const bytes = await dataUrlToBytes(imgDataUrl);
    const charId = crypto.randomUUID();
    const path = `characters/${shop_id}/${charId}.png`;
    const up = await admin.storage.from("marketing-videos").upload(path, bytes, {
      contentType: "image/png", upsert: true,
    });
    if (up.error) {
      console.error("[char-board] upload", up.error);
      return json({ error: "保存图片失败" }, 500);
    }
    const signed = await admin.storage.from("marketing-videos").createSignedUrl(path, 60 * 60 * 24 * 365);
    const coverUrl = signed.data?.signedUrl;
    if (!coverUrl) return json({ error: "签名链接失败" }, 500);

    const insertRow: any = {
      id: charId,
      shop_id,
      created_by: u.user.id,
      name,
      role_label: role_label || null,
      cover_url: coverUrl,
      ref_image_urls: subject_image_urls,
      prompt: `${subjectBlock}\n---\n${TEMPLATE}`,
      core_emotion: core_emotion || null,
      visual_signature: visual_signature || null,
      source: autoAnchor ? "auto_anchor" : "ai_generated",
      auto_anchor: autoAnchor,
      meta: { ...metaExtra, storage_path: path },
    };
    const { data: row, error: insErr } = await admin
      .from("marketing_characters").insert(insertRow).select().single();
    if (insErr) {
      console.error("[char-board] insert", insErr);
      return json({ error: insErr.message }, 500);
    }

    return json({ success: true, character: row });
  } catch (e) {
    console.error("[char-board] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

// 「一键智能广告图」
// 从用户素材库自动挑实拍图作参考,按类型(场景图/商品特写/人物图)批量生成广告海报。
// 复用「分镜静帧」那套高质量 Prompt(真人级电影感 + 商场 B1 门头约束)。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey,
} from "../_shared/video-styles.ts";
import {
  STOREFRONT_CONSTRAINT_ZH,
  STOREFRONT_CONSTRAINT_EN,
} from "../_shared/storefront-constraints.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type AdKind = "scene" | "product" | "person";
const AD_KIND_ZH: Record<AdKind, string> = {
  scene: "场景图",
  product: "商品特写",
  person: "人物图",
};
type Aspect = "1:1" | "3:4" | "9:16" | "16:9";
const ASPECT_TO_HINT: Record<Aspect, string> = {
  "1:1": "1:1 正方形构图,主体居中",
  "3:4": "3:4 竖版海报构图",
  "9:16": "9:16 手机竖屏构图,适合朋友圈/小红书封面",
  "16:9": "16:9 横版构图,适合横屏展示",
};

// ── 标签聚类:从素材库里按 kind 取候选实拍图 ────────────────
const KEYWORDS: Record<AdKind, string[]> = {
  scene: ["店内", "陈列", "货架", "氛围", "门头", "门面", "全景", "场景", "店铺"],
  product: ["商品", "单品", "特写", "杯子", "服饰", "玩具", "首饰", "包包", "杂货", "餐具"],
  person: ["人物", "店员", "顾客", "博主", "试穿", "试戴"],
};

function pickAssets(rows: any[], kind: AdKind, n: number): any[] {
  const kws = KEYWORDS[kind];
  const ranked = rows
    .map((r) => {
      const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
      const cat: string = (r.category || "").toString();
      const blob = (tags.join(" ") + " " + cat).toLowerCase();
      const score = kws.reduce((s, k) => s + (blob.includes(k.toLowerCase()) ? 1 : 0), 0);
      return { row: r, score };
    })
    .sort((a, b) => b.score - a.score);
  const matched = ranked.filter((x) => x.score > 0).map((x) => x.row);
  // 不够就从剩下的随机补齐
  const remaining = ranked.filter((x) => x.score === 0).map((x) => x.row);
  shuffle(remaining);
  const out = [...matched, ...remaining].slice(0, n);
  // 若总数还不够,允许重复使用
  while (out.length < n && rows.length > 0) out.push(rows[out.length % rows.length]);
  return out;
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Prompt builder ────────────────────────────────────────
function buildPrompt(opts: {
  kind: AdKind;
  styleKey: VideoStyleKey;
  realism: "photoreal" | "stylized";
  aspect: Aspect;
  theme?: string;
  refSummary?: string;
  index: number;
  total: number;
}): string {
  const { kind, styleKey, realism, aspect, theme, refSummary, index, total } = opts;
  const styleZh = VIDEO_STYLE_LABELS[styleKey];
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const lines: string[] = [];

  // 通用基调
  if (realism === "photoreal") {
    lines.push(`生成一张单帧定格画面。整体观感:真人级写实电影摄影静帧(photorealistic cinematic still, shot on full-frame mirrorless, 35mm/50mm prime, f/2.0, ISO 400),自然肤质/真实毛孔/真实瞳孔反光/真实景深与动态范围,让人无法分辨是 AI 生成。`);
  } else {
    lines.push(`生成一张轻度风格化的影视宣传海报(stylized cinematic poster / semi-illustrated keyframe),允许略带插画感,不要做成纪实快照。`);
  }
  lines.push(`${ASPECT_TO_HINT[aspect]};品牌:BOOMER·OFF 中古二手杂货店;真实店内自然光,白平衡准确,色彩还原真实,无滤镜、无暖黄/复古/橙调色;货架密集真实质感。`);
  lines.push(`风格基调:${styleZh}(${styleEn}) —— 只影响构图/光线方向/情绪,不影响真实感与色温。`);

  // 类型差异化
  if (kind === "scene") {
    lines.push(`【场景图】这是一张店内氛围/陈列特写:展现这家店的真实陈列、货架密度、灯光氛围、空间结构,不要主角人物特写,可以有路过的模糊背影但不抢戏。`);
    lines.push(STOREFRONT_CONSTRAINT_ZH);
  } else if (kind === "product") {
    lines.push(`【商品特写】这是一张商品海报:把附带参考图中的商品作为唯一主角,居中或黄金分割位,柔光,焦点清晰,背景虚化或干净桌面/陈列。严格保留参考图中商品的真实形状、颜色、材质、Logo、印花、标签文字,绝对不要改造商品本体。`);
    lines.push(`不要出现人脸/真人手部肌肤特写,可以有一只自然光下的手轻轻拿起或托住商品。`);
  } else {
    // person
    lines.push(`【人物图】这是一张真人逛店瞬间:画面里有 1 位真实店员或顾客自然出现在店内,与参考图中的真实店面/陈列融为一体。`);
    lines.push(`严格要求:真人级写实皮肤纹理,自然神态,眼神有焦点,衣着日常(避免明星脸/T 台脸/AI 网红脸);严禁面部畸变、塑料皮肤、多余手指、双胞胎分身。`);
    lines.push(STOREFRONT_CONSTRAINT_ZH);
  }

  if (refSummary) {
    lines.push(`画面中必须自然出现的实景元素(来自附带参考图):${refSummary} —— 颜色/陈列/光线请严格还原实拍,不要美化、不要调色。`);
  }
  if (theme && theme.trim()) {
    lines.push(`本张图的主题氛围:${theme.trim()}`);
  }
  lines.push(`第 ${index + 1} / ${total} 张广告图,与其它图保持品牌一致但构图与机位不要雷同。`);
  lines.push(`画质要求:高清,细节丰富,电影质感,色彩自然,光影柔和,胶片颗粒微细。`);
  lines.push(`严禁:任何文字、字幕、水印、Logo 文字、UI、画面边框;禁止 photorealistic real celebrity face、护照式正脸特写;禁止面部畸变、多余手指、塑料皮肤、AI 涂抹感、HDR 过曝、Instagram 调色、青绿色偏。`);
  return lines.join("\n");
}

async function generateOneImage(opts: {
  apiKey: string; prompt: string; refImageUrls: string[];
}): Promise<string> {
  const content: any[] = [{ type: "text", text: opts.prompt }];
  for (const url of opts.refImageUrls.slice(0, 4)) {
    if (url) content.push({ type: "image_url", image_url: { url } });
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
    throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const imgs: any[] = msg?.images || [];
  let url: string | undefined;
  if (imgs[0]?.image_url?.url) url = imgs[0].image_url.url;
  else if (typeof imgs[0] === "string") url = imgs[0];
  else if (data?.data?.[0]?.b64_json) url = `data:image/png;base64,${data.data[0].b64_json}`;
  if (!url) throw new Error("AI 未返回图片");
  return url;
}

async function dataUrlToBytes(dataUrl: string): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  if (dataUrl.startsWith("data:")) {
    const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) throw new Error("非法 dataUrl");
    const mime = m[1];
    const ext = mime.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const bin = atob(m[2]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return { bytes: buf, mime, ext };
  }
  const r = await fetch(dataUrl);
  const buf = new Uint8Array(await r.arrayBuffer());
  const mime = r.headers.get("content-type") || "image/png";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { bytes: buf, mime, ext };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const kinds: AdKind[] = Array.isArray(body.kinds) && body.kinds.length
      ? body.kinds.filter((k: any) => k === "scene" || k === "product" || k === "person")
      : ["scene"];
    const total = Math.max(1, Math.min(12, Number(body.total) || 9));
    const aspect: Aspect = (["1:1", "3:4", "9:16", "16:9"].includes(body.aspect) ? body.aspect : "3:4") as Aspect;
    const styleKey = normalizeStyle(body.style);
    const realism: "photoreal" | "stylized" = body.realism === "stylized" ? "stylized" : "photoreal";
    const theme: string = (body.theme || "").toString().slice(0, 200);
    const shopId: string | null = typeof body.shop_id === "string" && body.shop_id ? body.shop_id : null;
    if (!shopId) return json({ ok: false, error: "请先选择店铺" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 每日 50 张总额(沿用 ai-image-chat 限额口径)
    const today = new Date().toISOString().slice(0, 10);
    const { count: usedToday } = await admin
      .from("marketing_assets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.user.id)
      .eq("kind", "photo")
      .gte("created_at", `${today}T00:00:00Z`);
    if ((usedToday || 0) + total > 80) {
      return json({ ok: false, error: `今日 AI 出图额度已不足 ${total} 张,请明日再来` });
    }

    // 拉素材库实拍图(排除 AI 合成 / 分镜)
    const { data: lib } = await admin
      .from("marketing_assets")
      .select("id, output_url, tags, category, meta")
      .eq("user_id", u.user.id)
      .eq("kind", "photo")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(200);
    const reals = (lib || []).filter((r: any) => {
      const src = r?.meta?.source;
      const cat = (r?.category || "").toString();
      if (cat === "分镜头") return false;
      if (src === "storyboard" || src === "ai-image-chat" || src === "ai-smart-ad") return false;
      return !!r.output_url;
    });
    if (reals.length === 0) {
      return json({ ok: false, error: "素材库里还没有实拍图,先去『素材库』上传几张吧" });
    }

    // 任务分配:按 kinds 均分
    type Task = { idx: number; kind: AdKind; refUrl: string; refSummary?: string };
    const tasks: Task[] = [];
    const perKindCount = distributeCount(total, kinds.length);
    let cursor = 0;
    kinds.forEach((kind, ki) => {
      const n = perKindCount[ki];
      const picks = pickAssets(reals, kind, n);
      picks.forEach((r) => {
        const tagStr = Array.isArray(r.tags) ? r.tags.slice(0, 4).join("/") : "";
        const refSummary = [r.category, tagStr].filter(Boolean).join(" · ") || undefined;
        tasks.push({ idx: cursor++, kind, refUrl: r.output_url, refSummary });
      });
    });

    // 并行 4 路出图
    const concurrency = 4;
    const results: any[] = new Array(tasks.length);
    let nextIdx = 0;
    async function worker() {
      while (true) {
        const i = nextIdx++;
        if (i >= tasks.length) return;
        const t = tasks[i];
        try {
          const prompt = buildPrompt({
            kind: t.kind, styleKey, realism, aspect, theme,
            refSummary: t.refSummary, index: t.idx, total: tasks.length,
          });
          const dataUrl = await generateOneImage({
            apiKey: LOVABLE_API_KEY, prompt, refImageUrls: [t.refUrl],
          });
          const { bytes, mime, ext } = await dataUrlToBytes(dataUrl);
          const path = `${u.user.id}/smart-ad-${Date.now()}-${i}.${ext}`;
          const up = await admin.storage.from("product-images").upload(path, bytes, {
            contentType: mime, upsert: true,
          });
          if (up.error) throw new Error(up.error.message);
          const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);

          // sha256 去重
          const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
          const sha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

          const { data: row } = await admin.from("marketing_assets").insert({
            user_id: u.user.id,
            shop_id: shopId,
            kind: "photo",
            input_image_urls: [t.refUrl],
            output_url: pub.publicUrl,
            category: AD_KIND_ZH[t.kind],
            tags: ["AI智能广告", AD_KIND_ZH[t.kind], styleKey],
            sha256,
            meta: {
              source: "ai-smart-ad",
              kind: t.kind,
              style: styleKey,
              realism, aspect, theme: theme || null,
              source_asset_url: t.refUrl,
            },
          }).select().single();

          results[i] = {
            ok: true, idx: t.idx, kind: t.kind,
            output_url: pub.publicUrl,
            source_asset_url: t.refUrl,
            asset_id: row?.id,
          };
        } catch (e) {
          console.error(`[ai-smart-ad] task ${i}`, e);
          results[i] = {
            ok: false, idx: t.idx, kind: t.kind,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));

    return json({
      ok: true,
      total: tasks.length,
      succeeded: results.filter((r) => r?.ok).length,
      items: results,
    });
  } catch (e) {
    console.error("[ai-smart-ad] fatal", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

function distributeCount(total: number, parts: number): number[] {
  if (parts <= 1) return [total];
  const base = Math.floor(total / parts);
  const rem = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}

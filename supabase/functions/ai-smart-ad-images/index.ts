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
const STYLE_MOOD_EN: Record<VideoStyleKey, string> = {
  healing: "warm amber-gold practicals, low saturation, soft diffused window light, gentle film grain — cozy slice-of-life cinema",
  premium: "cool neutral palette with deep blacks, high micro-contrast, hard key + soft fill, polished editorial mood — high-end fashion campaign",
  vivid: "vibrant but not neon, motion blur on background, kinetic shutter drag, energetic dynamic composition — youth lifestyle ad",
} as any;

function pickOne<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function buildCinematicBaseEn(): string {
  const camera = pickOne([
    "shot on Arri Alexa Mini LF with anamorphic 40mm T2.0 lens, 1.5x squeeze, subtle horizontal lens flare",
    "shot on RED Komodo 6K with Cooke S4 50mm T2.0 prime, organic optical bokeh, gentle lens breathing",
    "shot on Sony Venice 2 with Zeiss Supreme 35mm T1.5, creamy out-of-focus areas, painterly fall-off",
  ]);
  const lighting = pickOne([
    "motivated three-point lighting, strong rim light separating subject from background, soft key from a practical lamp, Rembrandt shadow on faces",
    "single large soft source (north-facing window or 4x4 silk), negative fill on the shadow side for deep moody contrast, visible practical lamps glowing in background",
    "split lighting with hard key + heavy negative fill, atmospheric haze catching shafts of light, golden hour color temperature spilling across shelves",
  ]);
  const grade = "subtle teal-and-orange cinematic color grade, rich shadow detail, filmic highlight roll-off, Kodak Portra 400 / Fuji 400H film emulation, micro halation around highlights, fine organic grain";
  const comp = "deliberate composition (rule of thirds or centered symmetry), layered depth with foreground / midground / background, foreground bokeh element, leading lines, intentional negative space, shallow depth of field at f/1.4–f/2.0";
  const atmo = "atmospheric haze, soft dust particles drifting in light beams, reflections on glossy surfaces, practical neon / shelf LED / pendant lamp visible in frame as story-telling motif";
  return `CINEMATIC FILM-STILL PHOTOGRAPHY — ${camera}; ${lighting}; ${grade}; ${comp}; ${atmo}. The image must look like a frame grab from a high-budget feature film or a Magnum-grade editorial — NOT an amateur snapshot, NOT a phone photo, NOT flat lighting.`;
}

function buildPosterBaseEn(): string {
  return `CINEMATIC POSTER ART — Mondo / Criterion Collection cover quality, semi-illustrated keyframe with bold graphic composition, painterly light, hand-finished texture, rich shadow detail, designer-grade negative space. NOT a casual illustration, NOT a flat sticker.`;
}

function buildPrompt(opts: {
  kind: AdKind;
  styleKey: VideoStyleKey;
  realism: "photoreal" | "stylized";
  aspect: Aspect;
  theme?: string;
  refSummary?: string;
  index: number;
  total: number;
  styleGrade?: "documentary" | "cinematic";
}): string {
  const { kind, styleKey, realism, aspect, theme, refSummary, index, total } = opts;
  const styleGrade = opts.styleGrade === "cinematic" ? "cinematic" : "documentary";
  const styleZh = VIDEO_STYLE_LABELS[styleKey];
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const moodEn = STYLE_MOOD_EN[styleKey] || styleEn;
  const lines: string[] = [];

  // ============================================================
  // 默认:documentary 路线 —— 对齐分镜头静帧 photoreal,
  // 真实店内自然光、白平衡准确、无滤镜、无暖黄/橙调色,
  // 严格忠诚于参考实景照,不做电影广告化美化。
  // ============================================================
  if (styleGrade === "documentary" && realism === "photoreal") {
    lines.push(`生成一张单帧定格画面。整体观感:真人级写实电影摄影静帧(photorealistic still, shot on full-frame mirrorless, 35mm/50mm prime, f/2.0, ISO 400),自然肤质、真实瞳孔反光、真实景深与动态范围,让人无法分辨是 AI 生成。`);
    lines.push(`画幅 ${ASPECT_TO_HINT[aspect]},品牌:BOOMER·OFF 中古二手杂货店,真实店内自然光,白平衡准确,色彩还原真实,无滤镜、无暖黄/复古/橙调色,货架密集真实质感。`);
    lines.push(`风格基调:${styleZh}(${styleEn}) —— 只影响构图/节奏/情绪/光线方向,不改变真实感本身,不要做电影广告大片化处理。`);

    if (kind === "scene") {
      lines.push(`【场景图】这一张是店内全景/中景,展现真实陈列、货架密度、灯光氛围、空间结构;没有主角人脸特写,可有路过的模糊背影做点缀。构图自然,像真人逛店时随手抓拍的一帧,但要稳定不糊。`);
    } else if (kind === "product") {
      lines.push(`【商品特写】把参考图中的商品作为唯一主角,真实陈列环境里的近景特写。严格保留参考图中商品的真实形状、颜色、材质、Logo、印花、标签文字,绝对不要改造商品本体。光线沿用店内现有光,不要加摄影棚硬光、不要加 rim light、不要换干净桌面背景。可允许一只在自然光下的手轻轻托住或拿起商品。`);
    } else {
      lines.push(`【人物图】画面里 1 位真实店员或顾客自然出现在店内,与参考图中的真实店面/陈列融为一体;真实皮肤纹理、自然神态、衣着日常生活感(避免明星脸/T 台脸/AI 网红脸);严禁平光证件照、严禁直视镜头摆拍,严禁面部畸变、塑料皮肤、多余手指、双胞胎分身。`);
    }

    if (refSummary) {
      lines.push(`画面中必须自然出现的实景元素:${refSummary} —— 请严格参考附带的实景照,把这家店真实的陈列、氛围、商品融入画面,颜色/陈列/光线还原实拍,不要美化、不要调色、不要重排货架、不要新增不存在的商品。`);
    }
    if (theme && theme.trim()) {
      lines.push(`本张图的主题氛围:${theme.trim()}(只影响情绪暗示,不影响真实感)。`);
    }

    lines.push(STOREFRONT_CONSTRAINT_ZH);
    lines.push(STOREFRONT_CONSTRAINT_EN);
    lines.push(`第 ${index + 1} / ${total} 张图,与其它图保持品牌一致但机位、景别请刻意错开,避免雷同。`);
    lines.push(`画质要求:高清,细节丰富,色彩自然,光影柔和,胶片颗粒微细。`);
    lines.push(`风格约束:真人写实,非动漫,非卡通,非插画,非 3D 渲染,非 CG。`);
    lines.push(`NEGATIVE — strictly forbid: any text, subtitle, watermark, logo text, UI, image border; door frame, glass door, door handle, roll-up shutter, door curtain, push door, pull door, street view, sidewalk, road, traffic, outdoor sky; teal-and-orange grade, heavy color grade, Instagram filter preset, vintage wash, warm amber overlay, atmospheric haze, smoke, dust beams, anamorphic lens flare, three-point studio lighting, Rembrandt portrait lighting, rim light, beauty-dish key, magazine cover retouching, oversharpened, HDR halo, plastic AI skin, uncanny face, AI-airbrushed skin, melted hands, extra fingers, twin/clone duplicate, generic stock photo aesthetic, passport-style frontal portrait, real celebrity face, amateur on-camera flash.`);
    return lines.join("\n");
  }

  // ============================================================
  // cinematic 路线(原电影海报感):仅当用户显式切换时使用
  // ============================================================
  lines.push(`生成一张【电影艺术大片级】单帧画面,品牌:BOOMER·OFF 中古二手杂货店。最终观感必须是"专业团队 + 电影机 + 灯光师"才能拍出来的东西,绝对不能是普通人手机随手拍。`);
  if (realism === "photoreal") {
    lines.push(`真人级写实电影摄影静帧:真实皮肤纹理/真实瞳孔反光/真实景深/真实动态范围,让人无法分辨是 AI 生成。`);
    lines.push(buildCinematicBaseEn());
  } else {
    lines.push(`电影海报级风格化画面,允许带插画/油画笔触感,但必须有电影级光影体积,不是普通插画。`);
    lines.push(buildPosterBaseEn());
  }
  lines.push(`Aspect: ${ASPECT_TO_HINT[aspect]}.`);
  lines.push(`Style mood overlay: ${styleZh} / ${moodEn} —— 叠加在电影基底之上,只影响色温/情绪/光线方向,不要把画面拉回到 Instagram 滤镜或日杂随拍。`);

  if (kind === "scene") {
    const sceneDirector = pickOne([
      "Wes Anderson 式正面对称构图,中心透视,层层退到深景的货架,色彩成块分布,微缩感",
      "Roger Deakins 式自然光大场景,大面积阴影 + 一束高光从店招/灯带打下来,空间深度强烈",
      "Christopher Doyle 式手持低角度,前景虚化的商品作画框,后景货架灯带散景成圆点",
    ]);
    lines.push(`【场景图 · 导演视角】${sceneDirector}。展现店内真实陈列、货架密度、灯光氛围、空间结构;不要主角人脸特写,可有路过的模糊背影做点缀。`);
    lines.push(`色温对比:暖色卤素射灯 vs 冷色顶灯,在画面里形成戏剧化色温反差;突出货架灯带、商品高光反射、商品堆叠的层次感。`);
    lines.push(STOREFRONT_CONSTRAINT_ZH);
    lines.push(STOREFRONT_CONSTRAINT_EN);
    lines.push(`【店面镜头硬约束】如画面出现店面,必须呈现"商场 B1 室内走廊视角看向 8 米宽开放式店面",顶部门楣有 logo 灯箱;严禁出现任何门框/玻璃门/卷帘门/门把手/门帘/推拉门;背景必须是商场走廊/中庭/对面商铺/商场顶部灯,严禁出现街道/人行道/马路/户外天空。`);
  } else if (kind === "product") {
    lines.push(`【商品特写 · 静物广告大片】参考 Apple keynote / 无印良品 lookbook / 高端杂志静物页 的质感:把参考图中的商品作为唯一主角,居中或黄金分割,硬光 + 柔光混合,商品边缘有 rim light 打出体积,背景虚化为柔和色块或干净桌面/陈列。`);
    lines.push(`Product hero shot, beauty-dish key + rim back-light, subtle gradient backdrop, micro reflections on the surface, immaculate retouching aesthetic, magazine cover quality.`);
    lines.push(`严格保留参考图中商品的真实形状、颜色、材质、Logo、印花、标签文字,绝对不要改造商品本体;不要出现人脸/真人手部肌肤特写,可允许一只在自然光下的手轻轻托住或拿起商品。`);
    lines.push(`若背景隐约可见店面环境,必须是商场室内开放式店面,无门、无门框、无玻璃门。`);
    lines.push(STOREFRONT_CONSTRAINT_EN);
  } else {
    const personDirector = pickOne([
      "王家卫《花样年华》式色彩与暧昧光线,人物侧脸、不直视镜头,墙上灯带在脸上画出戏剧化阴影",
      "杨德昌《一一》式静观长镜感,人物自然站在货架间,被窗外/灯带打出 motivated light,有'被偶遇'的故事感",
      "是枝裕和式日常治愈光,自然柔光从侧面包裹人物,景深极浅,人物眼神有焦点",
    ]);
    lines.push(`【人物图 · 电影剧照感】${personDirector}。画面里 1 位真实店员或顾客自然出现在店内,与参考图中的真实店面/陈列融为一体;严禁平光证件照、严禁直视镜头摆拍。`);
    lines.push(`真人级写实皮肤纹理、自然神态、眼神有焦点、衣着日常生活感(避免明星脸/T 台脸/AI 网红脸);面部必须有 motivated light(从货架灯/窗外/店招透出)。`);
    lines.push(`严禁面部畸变、塑料皮肤、多余手指、双胞胎分身、AI 网红脸。`);
    lines.push(STOREFRONT_CONSTRAINT_ZH);
    lines.push(STOREFRONT_CONSTRAINT_EN);
    lines.push(`【店面镜头硬约束】如画面出现店面,必须是商场 B1 室内开放式店面,无门、无门框、无玻璃门、无卷帘门、无门把手;严禁街道/人行道/马路/户外天空。`);
  }

  if (refSummary) {
    lines.push(`画面中必须自然融入的实景元素(来自附带参考图):${refSummary} —— 颜色/陈列/商品请严格还原实拍,只能在光影/构图上做电影化升级,不要改造商品本体或店面结构。`);
  }
  if (theme && theme.trim()) {
    lines.push(`本张图的主题氛围:${theme.trim()}`);
  }
  lines.push(`第 ${index + 1} / ${total} 张广告图,与其它图保持品牌一致但构图、机位、景别请刻意错开,避免雷同。`);
  lines.push(`画质要求:超高清,细节丰富,电影级动态范围,光影体积感强,胶片颗粒微细。`);
  lines.push(`NEGATIVE — strictly forbid: any text, subtitle, watermark, logo text, UI, image border; door frame, glass door, door handle, roll-up shutter, door curtain, push door, pull door, store entrance with door, shop front gate, street view, sidewalk, road, traffic, outdoor sky, night street; amateur snapshot, phone photo, flat on-camera flash, harsh direct flash, oversharpened, HDR halo, Instagram filter preset, washed out, overexposed sky, plastic AI skin, uncanny face, AI-airbrushed skin, melted hands, extra fingers, twin/clone duplicate, generic stock photo aesthetic, passport-style frontal portrait, real celebrity face.`);
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
    const styleGrade: "documentary" | "cinematic" = body.style_grade === "cinematic" ? "cinematic" : "documentary";
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
            styleGrade,
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

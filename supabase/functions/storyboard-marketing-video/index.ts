// 「分镜静帧」生成器
// 输入:script + assets(场景实景图) + character(可选)
// 对脚本里每个分镜 (hook + scenes + outro) 并行调 Nano Banana 2
// 多图融合: 角色身份板 + 该镜绑定的实景照 → 输出一张本镜应该长什么样的静态图
// 输出: 把 storyboard_url 写回每个 clip,返回新 script
//
// 这一步把"模型空想画面"变成"模型只需让一张确定的画面动起来"。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey } from "../_shared/video-styles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface AssetLite { asset_id: string; index: number; url: string; summary?: string; category?: string | null; }
interface ClipLite {
  scene?: string; action?: string; dialogue?: string; subtitle?: string;
  image_index?: number | null; motion?: string; duration_s?: number;
  storyboard_url?: string | null;
}

function gatherClips(script: any): { key: 'hook' | 'scene' | 'outro'; sceneIndex: number; clip: ClipLite }[] {
  const out: { key: 'hook' | 'scene' | 'outro'; sceneIndex: number; clip: ClipLite }[] = [];
  if (script.hook && (script.hook.scene || script.hook.action)) {
    out.push({ key: 'hook', sceneIndex: -1, clip: script.hook });
  }
  if (Array.isArray(script.scenes)) {
    script.scenes.forEach((c: ClipLite, i: number) => {
      if (c && (c.scene || c.action)) out.push({ key: 'scene', sceneIndex: i, clip: c });
    });
  }
  if (script.outro && (script.outro.scene || script.outro.action)) {
    out.push({ key: 'outro', sceneIndex: -1, clip: script.outro });
  }
  return out;
}

function buildFramePrompt(opts: {
  clip: ClipLite; styleKey: VideoStyleKey; character: any | null;
  boundAssetSummary?: string; index: number; total: number;
}): string {
  const { clip, styleKey, character } = opts;
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const styleZh = VIDEO_STYLE_LABELS[styleKey];
  const lines: string[] = [];
  lines.push(`生成一张单帧定格画面(影视级电影感剧照,非插画非卡通)。`);
  lines.push(`画幅 9:16 竖版,品牌:BOOMER·OFF 中古二手杂货店,真实店内自然光,白平衡准确,色彩干净不偏色,无滤镜、无暖黄/复古调色,货架密集真实质感。`);
  lines.push(`风格基调:${styleZh}(${styleEn}) —— 只影响构图/节奏/情绪,不影响色温与饱和度。`);
  if (character?.name) {
    lines.push(`【主角必须出现且锁定身份】${character.name}${character.role_label ? `(${character.role_label})` : ''}。外观锁:${character.visual_signature || '严格还原参考图中的脸/发型/服装/体型'}。情绪:${character.core_emotion || '自然'}。面部/发型/服装必须 100% 与角色身份板一致,严禁换人换装。`);
  }
  if (opts.boundAssetSummary) {
    lines.push(`画面中必须自然出现的实景元素:${opts.boundAssetSummary}(请参考附带的实景照,把这家店真实的氛围、商品、陈列融入画面,而不是凭空想象;颜色还原实拍,不要美化也不要调色)。`);
  }
  if (clip.scene) lines.push(`场景:${clip.scene}`);
  if (clip.action) lines.push(`动作瞬间(请定格在这一瞬间):${clip.action}`);
  if (clip.motion) lines.push(`这张图代表的镜头是「${clip.motion}」的中间一帧。`);
  lines.push(`第 ${opts.index + 1} / ${opts.total} 个分镜,与其他分镜保持角色身份、构图语言一致,但不要互相对齐色调/滤镜。`);
  lines.push(`严禁:任何文字、字幕、水印、UI、卡通化、3D 渲染感、AI 涂抹感、面部畸变、多余手指;严禁加滤镜、暖黄调色、橙红色偏、复古褪色、青绿色偏、HDR 过曝、Instagram 风调色。`);
  return lines.join('\n');
}

async function generateOneFrame(opts: {
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
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const script = body.script;
    const assets: AssetLite[] = Array.isArray(body.assets) ? body.assets : [];
    const character = body.character || null;
    const shopId: string = body.shop_id || '_';
    const styleKey = normalizeStyle(body.style);
    const sessionId: string = body.session_id || crypto.randomUUID();
    const onlyIndices: number[] | null = Array.isArray(body.only_indices) ? body.only_indices : null;

    if (!script) return json({ ok: false, error: "缺少 script" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const clipsInfo = gatherClips(script);
    const total = clipsInfo.length;
    if (total === 0) return json({ ok: false, error: "脚本里没有可生成的分镜" });

    const targets = onlyIndices
      ? clipsInfo.filter((_, i) => onlyIndices.includes(i))
      : clipsInfo;

    const tasks = targets.map(async (item, _idx) => {
      const globalIdx = clipsInfo.indexOf(item);
      const { clip } = item;
      const refUrls: string[] = [];
      if (character?.cover_url) refUrls.push(character.cover_url);
      for (const u of character?.extra_reference_urls || []) if (u) refUrls.push(u);
      let boundSummary: string | undefined;
      if (typeof clip.image_index === 'number' && clip.image_index >= 0) {
        const asset = assets.find((a) => a.index === clip.image_index);
        if (asset) {
          refUrls.push(asset.url);
          boundSummary = asset.summary || asset.category || undefined;
        }
      }
      const prompt = buildFramePrompt({
        clip, styleKey, character,
        boundAssetSummary: boundSummary,
        index: globalIdx, total,
      });
      try {
        const dataUrl = await generateOneFrame({
          apiKey: LOVABLE_API_KEY, prompt, refImageUrls: refUrls,
        });
        const bytes = await dataUrlToBytes(dataUrl);
        const path = `storyboards/${shopId}/${sessionId}/${globalIdx}.png`;
        const up = await admin.storage.from("marketing-videos").upload(path, bytes, {
          contentType: "image/png", upsert: true,
        });
        if (up.error) throw new Error(up.error.message);
        const signed = await admin.storage.from("marketing-videos").createSignedUrl(path, 60 * 60 * 24 * 30);
        const url = signed.data?.signedUrl;
        if (!url) throw new Error("签名失败");
        return { ok: true as const, globalIdx, url, item };
      } catch (e) {
        console.error(`[storyboard] frame ${globalIdx}`, e);
        return { ok: false as const, globalIdx, error: e instanceof Error ? e.message : String(e), item };
      }
    });

    const results = await Promise.all(tasks);

    // 把 storyboard_url 写回 script
    const newScript = JSON.parse(JSON.stringify(script));
    const newGather = gatherClips(newScript);
    const frames: { scene_index: number; url: string | null; error?: string; key: string }[] = [];
    for (const r of results) {
      const info = newGather[r.globalIdx];
      if (!info) continue;
      if (r.ok) {
        info.clip.storyboard_url = r.url;
        frames.push({ scene_index: r.globalIdx, url: r.url, key: info.key });
      } else {
        info.clip.storyboard_url = null;
        frames.push({ scene_index: r.globalIdx, url: null, error: r.error, key: info.key });
      }
    }
    // 合并未重新生成的镜头(保留原 storyboard_url)
    if (onlyIndices) {
      newGather.forEach((info, i) => {
        if (!onlyIndices.includes(i) && script) {
          const old = gatherClips(script)[i]?.clip;
          if (old?.storyboard_url) info.clip.storyboard_url = old.storyboard_url;
        }
      });
    }

    return json({
      ok: true, session_id: sessionId, script: newScript, frames,
      total, succeeded: frames.filter((f) => f.url).length,
    });
  } catch (e) {
    console.error("[storyboard] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

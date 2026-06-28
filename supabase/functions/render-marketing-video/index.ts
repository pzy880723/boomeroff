// 提交视频渲染任务到火山方舟 Seedance 2.0 API。
// 渲染策略由 body.render_strategy 决定:
//   - 'one_shot':整段脚本 + 最多 9 张参考图,单次 Seedance 调用直出 ≤15s(对齐小云雀的玩法)
//   - 'per_shot':每个分镜 = 1 段,独立调用 Seedance,完成后由前端 ffmpeg-wasm 拼接(强一致性)
//   - 'auto'(默认):≤15s 且分镜数 ≤4 → one_shot,否则 per_shot
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { pickSegmentImages, type ScriptLike } from "../_shared/marketing-segments.ts";
import { resolveSeedanceModel, clampResolution, DEFAULT_SEEDANCE_2, SEEDANCE_MAX_SINGLE_SHOT, SEEDANCE_MAX_REFS } from "../_shared/seedance-models.ts";
import { normalizeRealism, type Realism } from "../_shared/realism.ts";
import { STOREFRONT_CONSTRAINT_EN, STOREFRONT_OPENING_EN } from "../_shared/storefront-constraints.ts";
import { softPassReferences } from "../_shared/face-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const MAX_SEG_DUR = SEEDANCE_MAX_SINGLE_SHOT; // 单段渲染上限(秒)= 15

type RenderStrategy = 'one_shot' | 'per_shot' | 'auto';
function normalizeStrategy(v: unknown): RenderStrategy {
  return v === 'one_shot' || v === 'per_shot' || v === 'auto' ? v : 'auto';
}

// 「一次推理多镜」Prompt:把整段脚本翻译成单条「分镜导演口令」,模型自己切镜头。
function buildOneShotPrompt(
  script: any,
  styleKey: VideoStyleKey,
  shopBlock: string,
  character: any,
  realism: Realism,
  overrides?: { opening?: string; style_cue?: string; persona_directive?: string } | null,
): string {
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const total = clampDuration(script.total_duration_s || 15);
  const aspect = script.aspect || '9:16';
  const shots: { label: string; sc: any }[] = [];
  const isMeaningful = (sc: any) =>
    sc && typeof sc === 'object' && (
      (typeof sc.scene === 'string' && sc.scene.trim()) ||
      (typeof sc.action === 'string' && sc.action.trim()) ||
      (typeof sc.subtitle === 'string' && sc.subtitle.trim()) ||
      (typeof sc.dialogue === 'string' && sc.dialogue.trim())
    );
  if (isMeaningful(script.hook)) shots.push({ label: '开场', sc: script.hook });
  if (Array.isArray(script.scenes)) script.scenes.forEach((sc: any, i: number) => {
    if (isMeaningful(sc)) shots.push({ label: `镜头${i + 1}`, sc });
  });
  if (isMeaningful(script.outro)) shots.push({ label: '收尾', sc: script.outro });

  const lines: string[] = [];
  lines.push(`【一段 ${total}s 的 ${aspect} 短视频,整体风格:${styleEn}${overrides?.style_cue ? ` · ${overrides.style_cue}` : ''}】`);
  lines.push(STOREFRONT_CONSTRAINT_EN);
  if (overrides?.persona_directive) {
    lines.push(`【主角(虚构探店博主 · 全片唯一主体)】${overrides.persona_directive}`);
  }
  if (overrides?.opening) {
    lines.push(`【强制开场(0-2s · 不可省略)】${overrides.opening}`);
  }
  if (character?.name && !overrides?.persona_directive) {
    lines.push(`【主体1】参考图 1 中的 ${character.name}(${character.role_label || '主角'})为全片唯一主角。外观锁:${character.visual_signature || '以参考图为准'}。全程同一人,禁止换人/换装/分身/双胞胎。`);
  }
  lines.push(`【镜头节奏】共 ${shots.length || 1} 个镜头,以自然剪辑切换,不要黑场过渡,人物、光线、调色保持一致。`);

  // 按时间线累积秒数,告诉模型每镜大概的起止
  let t = 0;
  for (const { label, sc } of shots) {
    const dur = Math.max(1, Math.min(MAX_SEG_DUR, Number(sc.duration_s) || 3));
    const start = t; const end = Math.min(total, t + dur); t = end;
    const motion = (sc.motion || '自然运镜').toString();
    const scene = (sc.scene || sc.video_prompt || '').toString().trim();
    const action = (sc.action || '').toString().trim();
    const dialogue = (sc.dialogue || '').toString().trim();
    const subtitle = (sc.subtitle || sc.text || '').toString().trim();
    const parts = [`【${label}】(${start}-${end}s · ${motion})`];
    if (scene) parts.push(`场景:${scene}`);
    if (action) parts.push(`动作:${action}`);
    if (dialogue) parts.push(`台词(同步口型):{${dialogue}}`);
    if (subtitle) parts.push(`屏幕字幕:【${subtitle}】`);
    lines.push(parts.join(' '));
  }

  if (shopBlock) lines.push(`店铺背景:\n${shopBlock}`);
  lines.push(`整体环境:BOOMER·OFF 中古二手杂货店,货架密集,室内暖色调。`);
  if (realism === 'photoreal') {
    lines.push(`整体画面:真人写实电影质感,高清,细节丰富,色彩自然,光影柔和;人物面部稳定不变形,动作自然流畅,无卡顿、无穿模、无 AI 涂抹感、无多余手指。`);
    lines.push(`风格约束:真人写实,非动漫,非卡通,非插画,非 3D 渲染。`);
  } else {
    lines.push(`整体画面保持轻度风格化的影视宣传质感,画面干净不偏色,无滤镜、无暖黄/复古调色;人物面部稳定不变形,动作自然流畅。`);
  }
  lines.push(`不要生成任何文字或字幕水印,不要生成 Logo。`);

  const out = lines.join('\n');
  return out.length > 2000 ? out.slice(0, 2000) : out;
}

// 一次成片模式的参考图聚合(全 reference 通道,上限 9 张,按权重去重)
function resolveOneShotImages(
  script: any,
  imageUrls: string[],
  character: { cover_url?: string; extra_reference_urls?: string[]; verified_asset_uri?: string } | null,
): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string | null) => {
    if (!u || seen.has(u)) return;
    seen.add(u); refs.push(u);
  };
  // 1) 角色身份板(认证 asset:// 优先)
  if (character?.verified_asset_uri) push(character.verified_asset_uri);
  else if (character?.cover_url) push(character.cover_url);
  // 2) 角色额外参考
  for (const u of character?.extra_reference_urls || []) push(u);
  // 3) 每镜手动绑定的实景照(按出场顺序)
  const allScenes: any[] = [];
  if (script.hook) allScenes.push(script.hook);
  if (Array.isArray(script.scenes)) allScenes.push(...script.scenes);
  if (script.outro) allScenes.push(script.outro);
  for (const sc of allScenes) {
    const idx = typeof sc?.image_index === 'number' ? sc.image_index
              : (typeof sc?.image_ref?.index === 'number' ? sc.image_ref.index : null);
    if (idx !== null && imageUrls[idx]) push(imageUrls[idx]);
  }
  // 4) 每镜静帧(若已合成)
  for (const sc of allScenes) {
    if (sc && typeof sc.storyboard_url === 'string' && sc.storyboard_url) push(sc.storyboard_url);
  }
  // 5) 剩余实景照按顺序补
  for (const u of imageUrls) push(u);
  // 6) 兜底封面
  if (!refs.length && character?.cover_url) push(character.cover_url);
  return refs.slice(0, SEEDANCE_MAX_REFS);
}



function buildPrompt(
  script: any,
  styleKey: VideoStyleKey,
  shopBlock: string,
  segLabel?: string,
  character?: any,
  realism: Realism = 'stylized',
): string {
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const lines: string[] = [];
  lines.push(`严格按以下分镜拍摄,不要增加、删减或调换镜头顺序。`);
  if (character?.name) {
    if (realism === 'photoreal') {
      lines.push(`【主体定义】将参考图中的 ${character.name}(${character.role_label || '主角'})定义为 主体1。后续所有镜头中,涉及到这位角色一律称呼「主体1」。外观锁:${character.visual_signature || '以参考图身份板为准'}。五官、发型、肤色、体型、年龄、气质与参考图完全一致,严禁换人或换装,严禁双胞胎/分身。`);
    } else {
      lines.push(`【主角锁定】每段必须出现同一主角:${character.name}(${character.role_label || '主角'})。外观锁:${character.visual_signature || '以参考图身份板为准'}。面部、发型、服装、体型、年龄、气质严格一致,严禁换人或换装。`);
    }
  }
  if (segLabel) lines.push(`这是【${segLabel}】,后续会与其他段无缝拼接,请保持画面、光线、调色与人物连贯。`);
  lines.push(`整体风格:${styleEn}。品牌:BOOMER·OFF 中古二手杂货店,货架密集,室内暖色调。`);
  lines.push(STOREFRONT_CONSTRAINT_EN);
  if (shopBlock) lines.push(`店铺背景(中文,用于影响氛围与字幕):\n${shopBlock}`);
  lines.push(`画幅 ${script.aspect || '9:16'},本段时长约 ${script.total_duration_s || 10} 秒。`);

  const pushShot = (label: string, sc: any) => {
    if (!sc) return;
    const dur = sc.duration_s || 2;
    const motion = sc.motion || '定格';
    const scene = (sc.scene || sc.video_prompt || '').toString().trim();
    const action = (sc.action || '').toString().trim();
    const dialogue = (sc.dialogue || '').toString().trim();
    const subtitle = (sc.subtitle || sc.text || '').toString().trim();
    if (!scene && !action && !subtitle && !dialogue) return;
    const parts = [`【${label}】(${dur}秒, 运镜:${motion})`];
    if (scene) parts.push(`场景:${scene}`);
    if (action) parts.push(`动作/镜头:${action}`);
    if (dialogue) parts.push(`台词(同步口型/画外音):{${dialogue}}`);
    if (subtitle) parts.push(`屏幕字幕(中文叠加):【${subtitle}】`);
    lines.push(parts.join(' '));
  };

  if (script.hook) pushShot('开场', script.hook);
  if (Array.isArray(script.scenes)) {
    script.scenes.forEach((sc: any, i: number) => pushShot(`镜头${i + 1}`, sc));
  }
  if (script.outro) pushShot('收尾', script.outro);

  // 火山官方推荐的画质+约束尾段
  if (realism === 'photoreal') {
    lines.push(`整体画面:真人写实电影质感,高清,细节丰富,色彩自然,光影柔和,胶片颗粒微细,无滤镜,无 HDR 过曝;人物面部稳定不变形,动作自然流畅,无卡顿、无穿模、无 AI 涂抹感、无多余手指。`);
    lines.push(`风格约束:真人写实,非动漫,非卡通,非插画,非 3D 渲染。`);
    lines.push(`视频全程禁止出现外形、着装、配饰完全一致的人物,禁止生成同款分身、双胞胎效果,同一画面中仅保留单个对应角色。`);
    lines.push(`不要生成任何文字或字幕,不要生成水印,不要生成 Logo。`);
  } else {
    lines.push(`整体画面保持轻度风格化的影视宣传质感,画面干净不偏色,无滤镜、无暖黄/复古调色;人物面部稳定不变形,动作自然流畅,无卡顿、无穿模、无多余手指。`);
    lines.push(`不要生成任何文字或字幕,不要生成水印,不要生成 Logo。`);
  }

  const out = lines.join('\n');
  return out.length > 2000 ? out.slice(0, 2000) : out;
}

function clampDuration(d: any): number {
  const n = Number(d) || 5;
  if (n < 3) return 3;          // Seedance 2.0 最短 3s
  if (n > MAX_SEG_DUR) return MAX_SEG_DUR;
  return Math.round(n);
}

function normalizeRatio(aspect: any): string {
  const a = String(aspect || "9:16");
  if (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(a)) return a;
  return "9:16";
}

// 多段切分:不再把每个分镜都单独提交。
// 目标是把 30/45/60 秒压到接近目标时长的 10s/5s 合法网格里,减少火山任务数、成本和函数 CPU 压力。
function splitScript(script: any): any[] {
  type Shot = { sc: any; role: 'hook' | 'mid' | 'outro' };
  const shots: Shot[] = [];
  const isMeaningful = (sc: any) =>
    sc && typeof sc === 'object' && (
      (typeof sc.scene === 'string' && sc.scene.trim()) ||
      (typeof sc.action === 'string' && sc.action.trim()) ||
      (typeof sc.subtitle === 'string' && sc.subtitle.trim()) ||
      (typeof sc.dialogue === 'string' && sc.dialogue.trim()) ||
      (typeof sc.storyboard_url === 'string' && sc.storyboard_url) ||
      (typeof sc.image_index === 'number')
    );
  if (isMeaningful(script.hook)) shots.push({ sc: script.hook, role: 'hook' });
  if (Array.isArray(script.scenes)) {
    for (const m of script.scenes) if (isMeaningful(m)) shots.push({ sc: m, role: 'mid' });
  }
  if (isMeaningful(script.outro)) shots.push({ sc: script.outro, role: 'outro' });

  // 兜底:脚本完全为空时,造一个 5s 的空段,避免 Seedance 调用直接 0 个
  if (!shots.length) {
    shots.push({ sc: { duration_s: 5, scene: '', action: '', subtitle: '', dialogue: '' }, role: 'hook' });
  }

  const target = Number(script.total_duration_s) || shots.reduce((s, x) => s + (Number(x.sc?.duration_s) || 3), 0) || 15;
  const desiredCount = Math.max(1, Math.min(6, Math.round(Math.max(5, target) / 10)));
  const segmentCount = Math.max(1, Math.min(desiredCount, shots.length));
  const durations = Array.from({ length: segmentCount }, () => 10);
  const sum = durations.reduce((a, b) => a + b, 0);
  if (sum - target >= 3) durations[durations.length - 1] = 5;

  const empty = { duration_s: 0, scene: '', action: '', dialogue: '', subtitle: '' };
  const distribute = (total: number, n: number) => {
    const base = Math.max(1, Math.floor(total / Math.max(1, n)));
    const arr = Array.from({ length: n }, () => base);
    let rest = Math.max(0, total - base * n);
    for (let i = 0; i < arr.length && rest > 0; i += 1, rest -= 1) arr[i] += 1;
    return arr;
  };

  return durations.map((dur, i) => {
    const start = Math.floor(i * shots.length / segmentCount);
    const end = Math.floor((i + 1) * shots.length / segmentCount);
    const group = shots.slice(start, Math.max(start + 1, end));
    const perShotDur = distribute(dur, group.length);
    const clips = group.map((s, idx) => ({ ...s, sc: { ...s.sc, duration_s: perShotDur[idx] || 1 } }));
    const hook = clips.find((s) => s.role === 'hook')?.sc || { ...empty };
    const outro = clips.find((s) => s.role === 'outro')?.sc || { ...empty };
    const scenes = clips.filter((s) => s.role === 'mid').map((s) => s.sc);
    return {
      ...script,
      hook,
      scenes,
      outro,
      total_duration_s: dur,
      __segment_index: i,
      __segment_total: segmentCount,
      __shot_role: clips.some((s) => s.role === 'hook') ? 'hook' : (clips.some((s) => s.role === 'outro') ? 'outro' : 'mid'),
    };
  });
}


// Seedance 2.0 reference-to-video(r2v)通道:火山方舟只接受固定时长。
// t2v(无参考图)按 clampDuration 范围放行;一旦带了 reference_image,duration 必须吸附到 5 或 10。
const R2V_VALID_DURATIONS = [5, 10] as const;
function snapR2vDuration(d: number): number {
  const n = Math.round(Number(d) || 5);
  if (n <= 7) return 5;
  return 10;
}

// one_shot 时把"目标总时长"吸附到 r2v 网格(≤7→5, ≤12→10, >12→15)。
function snapOneShotDuration(d: number): number {
  const n = Math.round(Number(d) || 10);
  if (n <= 7) return 5;
  if (n <= 12) return 10;
  return 15;
}

// 把切好的段按 r2v 合法网格 {5,10} 吸附,并合并相邻"两个 5s"为"一个 10s",
// 让最终送给火山的每一段都是合法时长,总时长在用户目标附近浮动。
function snapShotsToValidGrid(subScripts: any[]): any[] {
  if (!subScripts.length) return subScripts;
  // 先把每段 duration_s 吸附
  const snapped = subScripts.map((s) => {
    const d = snapR2vDuration(Number(s.total_duration_s) || 5);
    const clip = (sc: any) => sc && (sc.scene || sc.action || sc.subtitle || sc.dialogue)
      ? { ...sc, duration_s: d } : sc;
    return {
      ...s,
      total_duration_s: d,
      hook: clip(s.hook),
      scenes: Array.isArray(s.scenes) ? s.scenes.map(clip) : s.scenes,
      outro: clip(s.outro),
    };
  });
  // 合并相邻 5s → 10s(同 role 才合并,避免 hook 和 outro 串)
  const merged: any[] = [];
  for (let i = 0; i < snapped.length; i++) {
    const cur = snapped[i];
    const nxt = snapped[i + 1];
    if (
      cur.total_duration_s === 5 &&
      nxt && nxt.total_duration_s === 5 &&
      cur.__shot_role === nxt.__shot_role &&
      cur.__shot_role === 'mid'
    ) {
      // 合并:把后段的描述顺接到前段
      const mergedScenes = [
        ...(Array.isArray(cur.scenes) ? cur.scenes : []),
        ...(Array.isArray(nxt.scenes) ? nxt.scenes : []),
      ].map((sc) => ({ ...sc, duration_s: 5 }));
      merged.push({
        ...cur,
        scenes: mergedScenes,
        total_duration_s: 10,
      });
      i++; // 跳过下一段
    } else {
      merged.push(cur);
    }
  }
  // 重新编 segment_index / total
  return merged.map((s, i) => ({ ...s, __segment_index: i, __segment_total: merged.length }));
}

async function submitArkTask(opts: {
  arkKey: string; model: string; prompt: string; ratio: string; duration: number;
  resolution: string;
  referenceImages?: string[];
}): Promise<{ ok: true; id: string; mode: string; duration: number } | { ok: false; error: string; raw?: unknown }> {
  const content: any[] = [{ type: "text", text: opts.prompt }];
  // Seedance 2.0:全 reference 模式。first_frame / last_frame 与 reference_image 互斥,
  // 我们这种「分镜独立表达」的内容不需要逐帧锁画面,统一走 reference_image 通道。
  const refs = (opts.referenceImages || []).filter(Boolean).slice(0, SEEDANCE_MAX_REFS);
  for (const url of refs) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  const mode = refs.length ? "reference2video" : "text2video";

  // r2v 模式下把任意秒数吸附到 {5,10};t2v 不限。
  const effectiveDuration = mode === "reference2video"
    ? snapR2vDuration(opts.duration)
    : opts.duration;

  // 2.0 系列:不发送 seed / camera_fixed(2.0 不支持)
  const arkBody: Record<string, unknown> = {
    model: opts.model,
    content,
    resolution: opts.resolution,
    ratio: opts.ratio,
    duration: effectiveDuration,
    watermark: false,
    generate_audio: true,
  };
  const arkRes = await fetch(ARK_ENDPOINT, {
    method: "POST",
    headers: { "Authorization": `Bearer ${opts.arkKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(arkBody),
  });
  const arkJson: any = await arkRes.json().catch(() => ({}));
  if (!arkRes.ok || !arkJson?.id) {
    return {
      ok: false,
      error: arkJson?.error?.message || arkJson?.message || `Seedance 创建任务失败(${arkRes.status})`,
      raw: arkJson,
    };
  }
  return { ok: true, id: arkJson.id, mode, duration: effectiveDuration };
}

/** 组装某段的参考图集合(Seedance 2.0 全 reference 模式,上限 9 张,按权重排序):
 *  1) 本镜 storyboard 静帧(最强信号)
 *  2) 角色身份板(优先用火山真人认证的 asset:// URI)
 *  3) 角色额外参考图
 *  4) 段内绑定的实景照(锁商品/店铺)
 */
function resolveSegmentImages(
  sub: ScriptLike,
  imageUrls: string[],
  character: { cover_url?: string; extra_reference_urls?: string[] } | null,
  fallbackFirst?: string,
): { referenceImages: string[] } {
  const seq: any[] = [];
  if (sub.hook && (sub.hook.scene || sub.hook.action || sub.hook.storyboard_url)) seq.push(sub.hook);
  if (Array.isArray(sub.scenes)) seq.push(...sub.scenes);
  if (sub.outro && (sub.outro.scene || sub.outro.action || sub.outro.storyboard_url)) seq.push(sub.outro);

  const refs: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string | null) => {
    if (!u) return;
    if (seen.has(u)) return;
    seen.add(u);
    refs.push(u);
  };

  // 1) 本镜静帧(最高优先级)
  for (const sc of seq) {
    if (sc && typeof sc.storyboard_url === 'string' && sc.storyboard_url) push(sc.storyboard_url);
  }
  // 2) 角色身份板(认证过的 asset:// 优先)
  const verifiedUri: string | undefined = (character as any)?.verified_asset_uri || undefined;
  if (verifiedUri) push(verifiedUri);
  else if (character?.cover_url) push(character.cover_url);
  // 3) 角色额外参考
  for (const u of character?.extra_reference_urls || []) push(u);
  // 4) 段内绑定的实景照(2.0 全部按 reference 通道收集)
  const picks = pickSegmentImages(sub);
  for (const i of picks.refIndices) if (imageUrls[i]) push(imageUrls[i]);
  for (const sc of seq) {
    const idx = typeof sc?.image_index === 'number' ? sc.image_index : null;
    if (idx !== null && imageUrls[idx]) push(imageUrls[idx]);
  }
  // 5) 实在啥都没有 → 兜底封面
  if (!refs.length && fallbackFirst) push(fallbackFirst);

  return { referenceImages: refs.slice(0, SEEDANCE_MAX_REFS) };
}

async function softPassKeyReferences(
  urls: string[],
  opts: { admin: any; userId: string; max?: number },
): Promise<string[]> {
  const max = Math.max(1, Math.min(3, opts.max ?? 2));
  const verified = urls.filter((u) => typeof u === 'string' && u.startsWith('asset://')).slice(0, 1);
  const httpRefs = urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, max);
  const marked = httpRefs.length ? await softPassReferences(httpRefs, { admin: opts.admin, userId: opts.userId }) : [];
  const out = [...verified, ...marked].filter(Boolean);
  return (out.length ? out : urls.slice(0, 1)).slice(0, SEEDANCE_MAX_REFS);
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ ok: false, error: "未配置 ARK_API_KEY" });

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    let script = body.script;
    if (!script || !script.hook || !Array.isArray(script.scenes) || !script.outro) {
      return json({ ok: false, error: "脚本格式不完整" });
    }
    // 一键修复开关:disable_storyboard = 扔掉分镜静帧首尾帧,disable_references = 连参考图也不要
    // face_pipeline:character_sheet = 提交前就给参考图打 Character Sheet 软通过水印
    const disableStoryboard = !!body.disable_storyboard;
    const disableReferences = !!body.disable_references;
    let facePipeline: 'auto' | 'character_sheet' | 'illustration' | 'faceless' =
      (body.face_pipeline === 'character_sheet' || body.face_pipeline === 'illustration' || body.face_pipeline === 'faceless')
        ? body.face_pipeline : 'auto';
    // 角色记忆:本次未指定 face_pipeline 时,沿用角色卡持久化的 face_pass_level
    const charFacePass = (body.script?.character?.face_pass_level || '') as string;
    if (facePipeline === 'auto' && (charFacePass === 'character_sheet' || charFacePass === 'illustration' || charFacePass === 'faceless')) {
      facePipeline = charFacePass as any;
      console.log(`[render] inherit face_pass_level=${facePipeline} from character`);
    }
    if (disableStoryboard) {
      const strip = (c: any) => { if (c && typeof c === 'object') c.storyboard_url = null; };
      script = JSON.parse(JSON.stringify(script));
      strip(script.hook); strip(script.outro);
      if (Array.isArray(script.scenes)) script.scenes.forEach(strip);
    }


    const styleKey = normalizeStyle(body.style || script.style);
    const realism = normalizeRealism(body.realism ?? script.realism);
    const shopId: string | null = typeof body.shop_id === "string" && body.shop_id ? body.shop_id : null;
    const shopCtx = await loadShopContext(shopId);
    const shopBlock = formatShopContext(shopCtx);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 模型解析顺序:body.model → marketing_presets.video_model → 默认 Seedance 2.0 Pro
    // 不在白名单的回退到默认并日志告警
    const { data: presets } = await admin.from("marketing_presets").select("value").eq("key", "video_model").maybeSingle();
    const requestedModel =
      (typeof body.model === "string" && body.model) ||
      (presets?.value as any)?.id ||
      DEFAULT_SEEDANCE_2;
    const modelInfo = resolveSeedanceModel(requestedModel);
    const model = modelInfo.id;
    if (model !== requestedModel) {
      console.warn(`[render] requested model ${requestedModel} not in Seedance 2.0 whitelist, falling back to ${model}`);
    }
    const requestedRes = typeof body.resolution === "string" ? body.resolution : "720p";
    const resolution = clampResolution(modelInfo, requestedRes);
    const resolutionDowngraded = resolution !== requestedRes.toLowerCase();

    const ratio = normalizeRatio(script.aspect);
    const totalDur = Number(script.total_duration_s) || 0;
    const imageUrls: string[] = Array.isArray(script.image_urls) ? script.image_urls : [];
    const character = (script.character && typeof script.character === "object") ? script.character : null;
    const characterCover: string | undefined = character?.cover_url;
    const fallbackFirst = imageUrls[0] || characterCover;

    // ============ 渲染策略分发(one_shot / per_shot / auto) ============
    const requestedStrategy = normalizeStrategy(body.render_strategy);
    const meaningfulShotCount =
      (script.hook && (script.hook.scene || script.hook.action || script.hook.subtitle || script.hook.dialogue) ? 1 : 0) +
      (Array.isArray(script.scenes) ? script.scenes.filter((sc: any) => sc && (sc.scene || sc.action || sc.subtitle || sc.dialogue)).length : 0) +
      (script.outro && (script.outro.scene || script.outro.action || script.outro.subtitle || script.outro.dialogue) ? 1 : 0);
    let strategy: 'one_shot' | 'per_shot' = 'per_shot';
    let autoReason = '';
    if (requestedStrategy === 'one_shot') {
      strategy = 'one_shot'; autoReason = 'user_one_shot';
    } else if (requestedStrategy === 'per_shot') {
      strategy = 'per_shot'; autoReason = 'user_per_shot';
    } else {
      // auto:总时长 ≤15s 且分镜数 ≤4 → one_shot
      if (totalDur > 0 && totalDur <= MAX_SEG_DUR && meaningfulShotCount <= 4) {
        strategy = 'one_shot';
        autoReason = `auto:duration<=${MAX_SEG_DUR}s,shots=${meaningfulShotCount}`;
      } else {
        strategy = 'per_shot';
        autoReason = `auto:duration=${totalDur}s,shots=${meaningfulShotCount}`;
      }
    }
    console.log(`[render] strategy=${strategy} (${autoReason})`);

    const isSensitive = (err?: string, raw?: any) => {
      const code = raw?.error?.code || '';
      const msg = (err || '') + ' ' + (raw?.error?.message || '');
      return /InputImageSensitiveContent|may contain real person|PrivacyInformation|sensitive/i.test(code + ' ' + msg);
    };

    // ============ 一次成片(one_shot) ============
    if (strategy === 'one_shot') {
      const oneShotDur = snapOneShotDuration(totalDur || MAX_SEG_DUR);
      const effectiveChar = disableReferences ? null : character;
      const refImages = disableReferences ? [] : resolveOneShotImages(script, imageUrls, effectiveChar);
      const promptOverrides = (body.prompt_overrides && typeof body.prompt_overrides === 'object') ? body.prompt_overrides : null;
      const prompt = buildOneShotPrompt(script, styleKey, shopBlock, effectiveChar, realism, promptOverrides);
      const fallbackNotes: string[] = [];
      console.log(`[render one_shot] refs=${refImages.length} dur=${oneShotDur} face_pipeline=${facePipeline}`);

      // 用户主动选择软通过 → 提交前就处理
      let effectiveRefs = refImages;
      if (facePipeline === 'character_sheet' && refImages.length) {
        try {
          effectiveRefs = await softPassKeyReferences(refImages, { admin, userId: u.user.id, max: 3 });
          fallbackNotes.push('face_soft_pass_applied');
        } catch (e) { console.warn('[soft-pass one_shot pre]', (e as any)?.message); }
      }

      // L0: 全量参考
      let r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration: oneShotDur, resolution, referenceImages: effectiveRefs });
      // L0.5: 被真人拦了 → 自动给所有参考图打 Character Sheet 软通过水印再试
      if (!r.ok && isSensitive(r.error, (r as any).raw) && effectiveRefs.length && facePipeline !== 'character_sheet') {
        try {
          const marked = await softPassKeyReferences(effectiveRefs, { admin, userId: u.user.id, max: 3 });
          fallbackNotes.push('face_soft_pass_auto');
          r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration: oneShotDur, resolution, referenceImages: marked });
          if (r.ok) effectiveRefs = marked;
        } catch (e) { console.warn('[soft-pass one_shot auto]', (e as any)?.message); }
      }
      // L1: 仅角色板 / 第一张
      if (!r.ok && isSensitive(r.error, (r as any).raw) && effectiveRefs.length > 1) {
        fallbackNotes.push('references_trimmed_for_safety');
        r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration: oneShotDur, resolution, referenceImages: effectiveRefs.slice(0, 1) });
      }
      // L2: 纯文本
      if (!r.ok && isSensitive(r.error, (r as any).raw)) {
        fallbackNotes.push('references_dropped_for_safety');
        r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration: oneShotDur, resolution });
      }

      if (!r.ok) {
        return json({ ok: false, error: r.error, raw: (r as any).raw });
      }

      const { data: parent, error: pErr } = await admin.from("marketing_video_jobs").insert({
        user_id: u.user.id, script, status: "running", shop_id: shopId,
        provider: "volcengine_seedance", provider_task_id: r.id,
        segment_total: 1, segment_index: 0, parent_job_id: null,
        fallback_notes: fallbackNotes,
      }).select().single();
      if (pErr || !parent) {
        console.error("[render one_shot] parent insert", pErr);
        return json({ ok: false, error: "排队失败: " + (pErr?.message || '父任务创建失败') });
      }

      await admin.from("marketing_assets").insert({
        user_id: u.user.id, kind: "video", shop_id: shopId,
        input_image_urls: imageUrls, output_url: null,
        meta: {
          job_id: parent.id, video_type: script.video_type,
          duration: oneShotDur, target_duration_s: totalDur, actual_duration_s: oneShotDur, aspect: ratio,
          mode: refImages.length ? "reference2video" : "text2video",
          render_mode: "one_shot_reference",
          render_strategy: "one_shot",
          auto_decision_reason: autoReason,
          one_shot_refs: refImages,
          topic: script.topic || "", style: styleKey,
          style_label: VIDEO_STYLE_LABELS[styleKey], model, model_label: modelInfo.label, resolution,
          warnings: [
            ...(resolutionDowngraded ? ["resolution_downgraded"] : []),
            ...fallbackNotes,
          ],
          status: "running", segment_total: 1, segment_done: 0,
          stage: "generating", character_id: character?.id || null,
          character_name: character?.name || null,
          cover_url: imageUrls[0] || character?.cover_url || null,
        },
      });

      return json({
        ok: true, success: true, job_id: parent.id, status: "running",
        segment_total: 1, render_strategy: "one_shot", auto_decision_reason: autoReason,
        target_duration_s: totalDur, actual_duration_s: oneShotDur,
      });
    }

    // ============ 逐镜渲染路径(每个分镜 = 1 段,完成后由前端拼接) ============

    const rawSubScripts = splitScript(script);
    // r2v 路径(默认):按 {5,10} 网格吸附并合并相邻 5s → 一并送给火山,避免 11/13s 这种非法段。
    const subScripts = disableReferences ? rawSubScripts : snapShotsToValidGrid(rawSubScripts);
    const segmentTotal = subScripts.length;
    const targetDur = totalDur;
    const plannedActual = subScripts.reduce((a, s) => a + (Number(s.total_duration_s) || 0), 0);
    console.log(`[render multi] target=${targetDur}s actual≈${plannedActual}s segs=${subScripts.map((s)=>s.total_duration_s).join('+')}`);

    // 1) 先建父任务
    const { data: parent, error: pErr } = await admin.from("marketing_video_jobs").insert({
      user_id: u.user.id, script, status: "running", shop_id: shopId,
      provider: "volcengine_seedance", provider_task_id: null,
      segment_total: segmentTotal, segment_index: null, parent_job_id: null,
    }).select().single();
    if (pErr || !parent) {
      console.error("[render multi] parent insert", pErr);
      return json({ ok: false, error: "排队失败: " + (pErr?.message || '父任务创建失败') });
    }

    // 2) 并行提交所有段(每段带 3 级真人内容降级链;isSensitive 复用上面声明的)
    const submissions = await Promise.all(subScripts.map(async (sub, i) => {
      const label = `第 ${i + 1} 段 / 共 ${segmentTotal} 段`;
      const prompt = buildPrompt(sub, styleKey, shopBlock, label, character, realism);
      const duration = clampDuration(sub.total_duration_s || MAX_SEG_DUR);
      // 只有第 1 段在完全无图时兜底用 image_urls[0],其他段不强塞
      const segFallback = i === 0 && !disableReferences ? fallbackFirst : undefined;
      const effectiveCharacter = disableReferences ? null : character;
      const imgs = resolveSegmentImages(sub, imageUrls, effectiveCharacter, segFallback);
      if (disableReferences) imgs.referenceImages = [];
      console.log(`[render per-shot] seg ${i + 1}/${segmentTotal} ref=${imgs.referenceImages.length}`);
      const fallbackNotes: string[] = [];
      let effectiveRefs = imgs.referenceImages;
      // 用户主动选择软通过 → 提交前就处理
      if (facePipeline === 'character_sheet' && effectiveRefs.length) {
        try {
          effectiveRefs = await softPassKeyReferences(effectiveRefs, { admin, userId: u.user.id, max: 2 });
          fallbackNotes.push('face_soft_pass_applied');
        } catch (e) { console.warn(`[soft-pass seg${i + 1} pre]`, (e as any)?.message); }
      }
      // L0: 全量 reference
      let r = await submitArkTask({
        arkKey: ARK_KEY, model, prompt, ratio, duration, resolution,
        referenceImages: effectiveRefs,
      });
      // L0.5: 被真人拦了 → 自动给所有参考图打 Character Sheet 软通过水印再试
      if (!r.ok && isSensitive(r.error, (r as any).raw) && effectiveRefs.length && facePipeline !== 'character_sheet') {
        try {
          const marked = await softPassKeyReferences(effectiveRefs, { admin, userId: u.user.id, max: 2 });
          fallbackNotes.push('face_soft_pass_auto');
          r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration, resolution, referenceImages: marked });
          if (r.ok) effectiveRefs = marked;
        } catch (e) { console.warn(`[soft-pass seg${i + 1} auto]`, (e as any)?.message); }
      }
      // L1: 只留第一张参考(通常是 storyboard 静帧 / 角色板)
      if (!r.ok && isSensitive(r.error, (r as any).raw) && effectiveRefs.length > 1) {
        fallbackNotes.push('references_trimmed_for_safety');
        r = await submitArkTask({
          arkKey: ARK_KEY, model, prompt, ratio, duration, resolution,
          referenceImages: effectiveRefs.slice(0, 1),
        });
      }
      // L2: 纯文本
      if (!r.ok && isSensitive(r.error, (r as any).raw)) {
        fallbackNotes.push('references_dropped_for_safety');
        r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration, resolution });
      }

      return { i, r, sub, duration, imgs, fallbackNotes };
    }));



    // 3) 检查失败
    const failed = submissions.find((s) => !s.r.ok);
    if (failed) {
      const errMsg = `第 ${failed.i + 1} 段创建失败: ${(failed.r as any).error}`;
      console.error("[render multi]", errMsg);
      await admin.from("marketing_video_jobs").update({ status: "failed", error: errMsg }).eq("id", parent.id);
      return json({ ok: false, error: errMsg, raw: (failed.r as any).raw });
    }

    // 4) 全部成功 → 写入子任务记录
    const childTaskIds = submissions.map((s) => (s.r as any).id as string);
    const childRows = submissions.map((s) => ({
      user_id: u.user.id, script: s.sub, status: "queued", shop_id: shopId,
      provider: "volcengine_seedance", provider_task_id: (s.r as any).id,
      parent_job_id: parent.id, segment_index: s.i, segment_total: segmentTotal,
      fallback_notes: s.fallbackNotes,
    }));
    const { error: childErr } = await admin.from("marketing_video_jobs").insert(childRows);
    if (childErr) {
      console.error("[render multi] children insert", childErr);
      return json({ ok: false, error: "子任务入库失败: " + childErr.message });
    }

    // 5) 占位 marketing_assets
    const totalRefImages = submissions.reduce((s, x) => s + x.imgs.referenceImages.length, 0);
    const fallbackWarnings = Array.from(new Set(submissions.flatMap((s) => s.fallbackNotes)));
    // 父任务也聚合一份 fallback_notes(给详情面板顶部用)
    try {
      await admin.from("marketing_video_jobs").update({ fallback_notes: fallbackWarnings }).eq("id", parent.id);
    } catch {}
    await admin.from("marketing_assets").insert({
      user_id: u.user.id, kind: "video", shop_id: shopId,
      input_image_urls: imageUrls, output_url: null,
      meta: {
        job_id: parent.id, video_type: script.video_type,
        duration: totalDur, target_duration_s: targetDur, actual_duration_s: plannedActual, aspect: ratio,
        // Seedance 2.0:有参考图 = reference2video,完全无图 = text2video。
        mode: totalRefImages > 0 ? "reference2video" : "text2video",
        render_mode: "per_shot",
        render_strategy: "per_shot",
        auto_decision_reason: autoReason,
        topic: script.topic || "", style: styleKey,
        style_label: VIDEO_STYLE_LABELS[styleKey], model, model_label: modelInfo.label, resolution,
        warnings: [
          ...(resolutionDowngraded ? ["resolution_downgraded"] : []),
          ...fallbackWarnings,
        ],
        status: "running", segment_total: segmentTotal, segment_done: 0,
        stage: "generating", character_id: character?.id || null,
        character_name: character?.name || null,
        cover_url: imageUrls[0] || character?.cover_url || null,
        image_usage: {
          per_segment: submissions.map((s) => ({
            segment_index: s.i,
            reference_count: s.imgs.referenceImages.length,
          })),
        },
      },
    });



    return json({
      ok: true, success: true, job_id: parent.id, status: "running",
      segment_total: segmentTotal, child_task_ids: childTaskIds,
      render_strategy: "per_shot", auto_decision_reason: autoReason,
      target_duration_s: targetDur, actual_duration_s: plannedActual,
    });
  } catch (e) {
    console.error("[render] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

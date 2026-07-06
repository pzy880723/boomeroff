// 提交视频渲染任务到火山方舟 Seedance 2.0 API。
// 渲染策略由 body.render_strategy 决定:
//   - 'one_shot':整段脚本 + 最多 9 张参考图,单次 Seedance 调用直出 ≤15s(对齐小云雀的玩法)
//   - 'per_shot':按 5/10 秒合法网格分段,独立调用 Seedance,完成后由前端拼接
//   - 'auto'(默认):≤15s 且分镜数 ≤4 → one_shot,否则 per_shot
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { pickSegmentImages, planSegments, type ScriptLike } from "../_shared/marketing-segments.ts";
import { resolveSeedanceModel, clampResolution, DEFAULT_SEEDANCE_2, SEEDANCE_MAX_SINGLE_SHOT, SEEDANCE_MAX_REFS } from "../_shared/seedance-models.ts";
import { normalizeRealism, type Realism } from "../_shared/realism.ts";
import { STOREFRONT_CONSTRAINT_EN, STOREFRONT_OPENING_EN } from "../_shared/storefront-constraints.ts";
import { OWN_BRAND_LOCK_EN } from "../_shared/brand-scrub.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
  lines.push(OWN_BRAND_LOCK_EN);
  if (overrides?.persona_directive) {
    lines.push(`【主角(虚构探店博主 · 全片唯一主体)】${overrides.persona_directive}`);
  }
  if (overrides?.opening) {
    lines.push(`【强制开场(0-2s · 不可省略)】${overrides.opening}`);
  }
  lines.push(`【强制画面锁定】如果随请求附带了分镜静帧(reference images),必须优先照着这些静帧的场景、陈列、人物位置、构图和光影生成动态画面;禁止重新设计场景,禁止把店铺想象成别的空间。`);
  if (character?.name && !overrides?.persona_directive) {
    lines.push(`【主体1】参考图 1 中的 ${character.name}(${character.role_label || '主角'})为全片唯一主角。外观锁:${character.visual_signature || '以参考图为准'}。全程同一人,禁止换人/换装/分身/双胞胎。`);
  }

  // 【核心】优先使用脚本里的 one_shot_prompt(一段话导演稿),让 Seedance 自由发挥,
  // 分镜逐条的堆砌只在没有 one_shot_prompt 时兜底,避免模型被硬口令切碎导致人物/情节崩塌。
  const oneShotPrompt = (script?.one_shot_prompt || '').toString().trim();
  if (oneShotPrompt) {
    lines.push(`【导演稿(核心内容 · 请围绕这段自由发挥,不要切成机械分镜)】\n${oneShotPrompt}`);
  } else {
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
  const allScenes: any[] = [];
  if (script.hook) allScenes.push(script.hook);
  if (Array.isArray(script.scenes)) allScenes.push(...script.scenes);
  if (script.outro) allScenes.push(script.outro);
  // 1) 每镜静帧最优先:它才是最终画面蓝图
  for (const sc of allScenes) {
    if (sc && typeof sc.storyboard_url === 'string' && sc.storyboard_url) push(sc.storyboard_url);
  }
  // 2) 角色身份板(认证 asset:// 优先)
  if (character?.verified_asset_uri) push(character.verified_asset_uri);
  else if (character?.cover_url) push(character.cover_url);
  // 3) 角色额外参考
  for (const u of character?.extra_reference_urls || []) push(u);
  // 4) 每镜手动绑定的实景照(按出场顺序)
  for (const sc of allScenes) {
    const idx = typeof sc?.image_index === 'number' ? sc.image_index
              : (typeof sc?.image_ref?.index === 'number' ? sc.image_ref.index : null);
    if (idx !== null && imageUrls[idx]) push(imageUrls[idx]);
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
  lines.push(`【最重要】本段随请求附带的分镜静帧是画面蓝图:必须严格参考静帧里的店内空间、商品陈列、人物位置、镜头景别、光线和构图来动起来;不要重新设计场景,不要凭空生成门框/街边/陌生店铺。`);
  lines.push(`整体风格:${styleEn}。品牌:BOOMER·OFF 中古二手杂货店,货架密集,室内暖色调。`);
  lines.push(STOREFRONT_CONSTRAINT_EN);
  lines.push(OWN_BRAND_LOCK_EN);
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

function gatherClips(script: any): any[] {
  const out: any[] = [];
  if (script?.hook && (script.hook.scene || script.hook.action || script.hook.storyboard_url)) out.push(script.hook);
  if (Array.isArray(script?.scenes)) script.scenes.forEach((sc: any) => {
    if (sc && (sc.scene || sc.action || sc.storyboard_url)) out.push(sc);
  });
  if (script?.outro && (script.outro.scene || script.outro.action || script.outro.storyboard_url)) out.push(script.outro);
  return out;
}

function storyboardRefsOf(script: any): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sc of gatherClips(script)) {
    const u = typeof sc?.storyboard_url === 'string' ? sc.storyboard_url : '';
    if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

function missingStoryboardCount(script: any): number {
  return gatherClips(script).filter((sc) => !sc?.storyboard_url).length;
}

// 多段切分:按 Seedance 2.0 参考图合法网格切段。
// 30s=10+10+10,45s=10+10+10+10+5,60s=10×6;与前端 planSegments 完全一致。
function splitScript(script: any): any[] {
  const plans = planSegments(script);
  const empty = { duration_s: 0, scene: '', action: '', dialogue: '', subtitle: '' };
  const clips: Array<{ label: string; role: 'hook' | 'mid' | 'outro'; sc: any }> = [];
  if (script.hook) clips.push({ label: '钩子', role: 'hook', sc: script.hook });
  if (Array.isArray(script.scenes)) {
    script.scenes.forEach((sc: any, i: number) => clips.push({ label: `镜头${i + 1}`, role: 'mid', sc }));
  }
  if (script.outro) clips.push({ label: '收尾', role: 'outro', sc: script.outro });
  if (!plans.length) {
    return [{ ...script, hook: { ...empty, duration_s: 5 }, scenes: [], outro: { ...empty }, total_duration_s: 5, __segment_index: 0, __segment_total: 1, __shot_role: 'hook' }];
  }
  const distribute = (total: number, n: number) => {
    const base = Math.max(1, Math.floor(total / Math.max(1, n)));
    const arr = Array.from({ length: n }, () => base);
    let rest = Math.max(0, total - base * n);
    for (let i = 0; i < arr.length && rest > 0; i += 1, rest -= 1) arr[i] += 1;
    return arr;
  };
  return plans.map((plan) => {
    const group = plan.sceneLabels
      .map((label) => clips.find((c) => c.label === label))
      .filter(Boolean) as Array<{ label: string; role: 'hook' | 'mid' | 'outro'; sc: any }>;
    const actual = group.length ? group : clips.slice(0, 1);
    const perShotDur = distribute(plan.durationS, actual.length);
    const patched = actual.map((c, idx) => ({ ...c, sc: { ...c.sc, duration_s: perShotDur[idx] || 1 } }));
    return {
      ...script,
      hook: patched.find((s) => s.role === 'hook')?.sc || { ...empty },
      scenes: patched.filter((s) => s.role === 'mid').map((s) => s.sc),
      outro: patched.find((s) => s.role === 'outro')?.sc || { ...empty },
      total_duration_s: plan.durationS,
      __segment_index: plan.index,
      __segment_total: plan.total,
      __shot_role: patched.some((s) => s.role === 'hook') ? 'hook' : (patched.some((s) => s.role === 'outro') ? 'outro' : 'mid'),
    };
  });
}


// one_shot 时把"目标总时长"吸附到 r2v 网格(≤7→5, ≤12→10, >12→15)。
function snapOneShotDuration(d: number): number {
  const n = Math.round(Number(d) || 10);
  if (n <= 7) return 5;
  if (n <= 12) return 10;
  return 15;
}

/** 组装某段的参考图集合(Seedance 2.0 全 reference 模式,上限 9 张,按权重排序):
 *  1) 角色身份板(优先用火山真人认证的 asset:// URI)
 *  2) 角色额外参考图
 *  3) 本镜 storyboard 静帧/段内绑定实景照(锁商品/店铺)
 */
function resolveSegmentImages(
  sub: ScriptLike,
  imageUrls: string[],
  character: { cover_url?: string; extra_reference_urls?: string[]; verified_asset_uri?: string } | null,
  fallbackFirst?: string,
): { referenceImages: string[]; storyboardRefs: string[]; rawRefs: string[]; characterRefs: string[] } {
  const seq: any[] = [];
  if (sub.hook && (sub.hook.scene || sub.hook.action || sub.hook.storyboard_url)) seq.push(sub.hook);
  if (Array.isArray(sub.scenes)) seq.push(...sub.scenes);
  if (sub.outro && (sub.outro.scene || sub.outro.action || sub.outro.storyboard_url)) seq.push(sub.outro);

  const refs: string[] = [];
  const storyboardRefs: string[] = [];
  const rawRefs: string[] = [];
  const characterRefs: string[] = [];
  const seen = new Set<string>();
  const push = (u?: string | null, bucket?: string[]) => {
    if (!u) return;
    if (bucket && !bucket.includes(u)) bucket.push(u);
    if (seen.has(u)) return;
    seen.add(u);
    refs.push(u);
  };

  // 1) 本段分镜静帧最优先。它是最终画面蓝图,不能被角色板/原图挤出 9 张上限。
  for (const sc of seq) {
    if (sc && typeof sc.storyboard_url === 'string' && sc.storyboard_url) push(sc.storyboard_url, storyboardRefs);
  }
  // 2) 角色身份板(认证过的 asset:// 优先)。
  const verifiedUri: string | undefined = (character as any)?.verified_asset_uri || undefined;
  if (verifiedUri) push(verifiedUri, characterRefs);
  else if (character?.cover_url) push(character.cover_url, characterRefs);
  // 3) 角色额外参考
  for (const u of character?.extra_reference_urls || []) push(u, characterRefs);
  // 4) 段内绑定的实景照(2.0 全部按 reference 通道收集)
  const picks = pickSegmentImages(sub);
  for (const i of picks.refIndices) if (imageUrls[i]) push(imageUrls[i], rawRefs);
  for (const sc of seq) {
    const idx = typeof sc?.image_index === 'number' ? sc.image_index : null;
    if (idx !== null && imageUrls[idx]) push(imageUrls[idx], rawRefs);
  }
  // 5) 实在啥都没有 → 兜底封面
  if (!refs.length && fallbackFirst) push(fallbackFirst, rawRefs);

  return {
    referenceImages: refs.slice(0, SEEDANCE_MAX_REFS),
    storyboardRefs,
    rawRefs,
    characterRefs,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    const requireStoryboard = !!body.require_storyboard && !disableStoryboard && !disableReferences;
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

    if (requireStoryboard) {
      const missing = missingStoryboardCount(script);
      if (missing > 0) {
        return json({ ok: false, error: `还有 ${missing} 个镜头没有分镜静帧,已停止渲染。请先补齐分镜静帧。` }, 400);
      }
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

    // ============ 一次成片(one_shot) ============
    if (strategy === 'one_shot') {
      const oneShotDur = snapOneShotDuration(totalDur || MAX_SEG_DUR);
      const effectiveChar = disableReferences ? null : character;
      const refImages = disableReferences ? [] : resolveOneShotImages(script, imageUrls, effectiveChar);
      const storyboardRefs = storyboardRefsOf(script);
      const promptOverrides = (body.prompt_overrides && typeof body.prompt_overrides === 'object') ? body.prompt_overrides : null;
      const prompt = buildOneShotPrompt(script, styleKey, shopBlock, effectiveChar, realism, promptOverrides);
      console.log(`[render one_shot] refs=${refImages.length} dur=${oneShotDur} face_pipeline=${facePipeline}`);

      const { data: parent, error: pErr } = await admin.from("marketing_video_jobs").insert({
        user_id: u.user.id,
        script: {
          ...script,
          __render_payload: {
            prompt, duration: oneShotDur, ratio, model, resolution,
            reference_images: refImages,
            storyboard_refs: storyboardRefs,
            storyboard_ref_count: storyboardRefs.length,
            raw_ref_count: Math.max(0, refImages.length - storyboardRefs.length),
            face_pipeline: facePipeline,
          },
        },
        status: "queued", shop_id: shopId,
        provider: "volcengine_seedance", provider_task_id: null,
        segment_total: 1, segment_index: 0, parent_job_id: null,
        fallback_notes: [],
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
          storyboard_ref_count: storyboardRefs.length,
          topic: script.topic || "", style: styleKey,
          title: (script.title || script.topic || "").toString().slice(0, 24),
          style_label: VIDEO_STYLE_LABELS[styleKey], model, model_label: modelInfo.label, resolution,
          warnings: [
            ...(resolutionDowngraded ? ["resolution_downgraded"] : []),
          ],
          status: "queued", segment_total: 1, segment_done: 0,
          stage: "generating", character_id: character?.id || null,
          character_name: character?.name || null,
          cover_url: imageUrls[0] || character?.cover_url || null,
        },
      });

      return json({
        ok: true, success: true, job_id: parent.id, status: "queued",
        segment_total: 1, render_strategy: "one_shot", auto_decision_reason: autoReason,
        target_duration_s: totalDur, actual_duration_s: oneShotDur,
      });
    }

    // ============ 分段渲染路径(按 5/10 秒合法网格分段,完成后由前端拼接) ============

    const subScripts = splitScript(script);
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

    // 2) 先写素材占位。真正的火山提交由 poll-marketing-video 每次推进 1 段完成,
    // 避免一个 Edge Function 内连续提交多段 + 图片处理导致 CPU 超限。
    await admin.from("marketing_assets").insert({
      user_id: u.user.id, kind: "video", shop_id: shopId,
      input_image_urls: imageUrls, output_url: null,
      meta: {
        job_id: parent.id, video_type: script.video_type,
        duration: totalDur, target_duration_s: targetDur, actual_duration_s: plannedActual, aspect: ratio,
        mode: disableReferences || (!imageUrls.length && !character) ? "text2video" : "reference2video",
        render_mode: "per_shot",
        render_strategy: "per_shot",
        auto_decision_reason: autoReason,
        topic: script.topic || "", style: styleKey,
        title: (script.title || script.topic || "").toString().slice(0, 24),
        style_label: VIDEO_STYLE_LABELS[styleKey], model, model_label: modelInfo.label, resolution,
        warnings: [
          ...(resolutionDowngraded ? ["resolution_downgraded"] : []),
        ],
        status: "queued", segment_total: segmentTotal, segment_done: 0,
        stage: "generating", character_id: character?.id || null,
        character_name: character?.name || null,
        cover_url: imageUrls[0] || character?.cover_url || null,
      },
    });

    const childRows = subScripts.map((sub, i) => {
      const label = `第 ${i + 1} 段 / 共 ${segmentTotal} 段`;
      const prompt = buildPrompt(sub, styleKey, shopBlock, label, character, realism);
      const duration = clampDuration(sub.total_duration_s || MAX_SEG_DUR);
      const segFallback = i === 0 && !disableReferences ? fallbackFirst : undefined;
      const effectiveCharacter = disableReferences ? null : character;
      const imgs = resolveSegmentImages(sub, imageUrls, effectiveCharacter, segFallback);
      if (disableReferences) imgs.referenceImages = [];
      if (requireStoryboard && imgs.storyboardRefs.length === 0) {
        throw new Error(`第 ${i + 1} 段没有绑定分镜静帧,已停止渲染`);
      }
      console.log(`[render queue] seg ${i + 1}/${segmentTotal} dur=${duration} ref=${imgs.referenceImages.length} storyboard=${imgs.storyboardRefs.length}`);
      return {
        user_id: u.user.id,
        script: {
          ...sub,
          __render_payload: {
            prompt, duration, ratio, model, resolution,
            reference_images: imgs.referenceImages,
            storyboard_refs: imgs.storyboardRefs,
            raw_refs: imgs.rawRefs,
            character_refs: imgs.characterRefs,
            storyboard_ref_count: imgs.storyboardRefs.length,
            raw_ref_count: imgs.rawRefs.length,
            character_ref_count: imgs.characterRefs.length,
            face_pipeline: facePipeline,
          },
        },
        status: "queued",
        shop_id: shopId,
        provider: "volcengine_seedance",
        provider_task_id: null,
        parent_job_id: parent.id,
        segment_index: i,
        segment_total: segmentTotal,
        fallback_notes: [],
      };
    });
    const { error: childErr } = await admin.from("marketing_video_jobs").insert(childRows);
    if (childErr) {
      console.error("[render queue] children insert", childErr);
      await admin.from("marketing_video_jobs").update({ status: "failed", error: "分段入队失败: " + childErr.message }).eq("id", parent.id);
      return json({ ok: false, error: "分段入队失败: " + childErr.message });
    }


    return json({
      ok: true, success: true, job_id: parent.id, status: "running",
      segment_total: segmentTotal,
      render_strategy: "per_shot", auto_decision_reason: autoReason,
      target_duration_s: targetDur, actual_duration_s: plannedActual,
    });
  } catch (e) {
    console.error("[render] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

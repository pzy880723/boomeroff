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
  lines.push(`【一段 ${total}s 的 ${aspect} 短视频,整体风格:${styleEn}】`);
  if (character?.name) {
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
      lines.push(`【主体定义】将参考图中的 ${character.name}(${character.role_label || '主角'})定义为 主体1。后续所有镜头中,涉及到这位角色一律称呼「主体1」。外观锁:${character.visual_signature || '以首帧参考身份板为准'}。五官、发型、肤色、体型、年龄、气质与参考图完全一致,严禁换人或换装,严禁双胞胎/分身。`);
    } else {
      lines.push(`【主角锁定】每段必须出现同一主角:${character.name}(${character.role_label || '主角'})。外观锁:${character.visual_signature || '以首帧参考身份板为准'}。面部、发型、服装、体型、年龄、气质严格一致,严禁换人或换装。`);
    }
  }
  if (segLabel) lines.push(`这是【${segLabel}】,后续会与其他段无缝拼接,请保持画面、光线、调色与人物连贯。`);
  lines.push(`整体风格:${styleEn}。品牌:BOOMER·OFF 中古二手杂货店,货架密集,室内暖色调。`);
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
  if (n < 4) return 4;
  if (n > MAX_SEG_DUR) return MAX_SEG_DUR;
  return Math.round(n);
}

function normalizeRatio(aspect: any): string {
  const a = String(aspect || "9:16");
  if (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(a)) return a;
  return "9:16";
}

// 逐镜切段:每个非空分镜 = 1 段。
// hook / scenes[*] / outro 各自成段,独立用自己的静帧作 first_frame 喂给 Seedance,
// 最后由前端 ffmpeg-wasm 按 segment_index 升序拼接成成片。
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

  const empty = { duration_s: 0, scene: '', action: '', dialogue: '', subtitle: '' };
  return shots.map((s, i) => {
    const rawDur = Number(s.sc.duration_s);
    // Seedance 单段最短 4s,最长 15s。短于 4s 的镜头会被拉到 4s(轻微费用上浮换语义完整)。
    const dur = Math.max(4, Math.min(MAX_SEG_DUR, Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur) : 5));
    const clip = { ...s.sc, duration_s: dur };
    return {
      ...script,
      hook: s.role === 'hook' ? clip : { ...empty },
      scenes: s.role === 'mid' ? [clip] : [],
      outro: s.role === 'outro' ? clip : { ...empty },
      total_duration_s: dur,
      __segment_index: i,
      __segment_total: shots.length,
      __shot_role: s.role,
    };
  });
}


async function submitArkTask(opts: {
  arkKey: string; model: string; prompt: string; ratio: string; duration: number;
  resolution: string;
  referenceImages?: string[];
}): Promise<{ ok: true; id: string; mode: string } | { ok: false; error: string; raw?: unknown }> {
  const content: any[] = [{ type: "text", text: opts.prompt }];
  // Seedance 2.0:全 reference 模式。first_frame / last_frame 与 reference_image 互斥,
  // 我们这种「分镜独立表达」的内容不需要逐帧锁画面,统一走 reference_image 通道。
  const refs = (opts.referenceImages || []).filter(Boolean).slice(0, SEEDANCE_MAX_REFS);
  for (const url of refs) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  const mode = refs.length ? "reference2video" : "text2video";

  // 2.0 系列:不发送 seed / camera_fixed(2.0 不支持)
  const arkBody: Record<string, unknown> = {
    model: opts.model,
    content,
    resolution: opts.resolution,
    ratio: opts.ratio,
    duration: opts.duration,
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
  return { ok: true, id: arkJson.id, mode };
}

/** 组装某段的参考图集合(全 reference 模式,上限 4 张,按权重排序):
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
  // 4) 段内绑定的实景照(reference 通道 + 老 first/last 字段都收进来)
  const picks = pickSegmentImages(sub);
  for (const i of picks.refIndices) if (imageUrls[i]) push(imageUrls[i]);
  if (picks.firstIndex !== null && imageUrls[picks.firstIndex]) push(imageUrls[picks.firstIndex]);
  if (picks.lastIndex !== null && imageUrls[picks.lastIndex]) push(imageUrls[picks.lastIndex]);
  for (const sc of seq) {
    const idx = typeof sc?.image_index === 'number' ? sc.image_index : null;
    if (idx !== null && imageUrls[idx]) push(imageUrls[idx]);
  }
  // 5) 实在啥都没有 → 兜底封面
  if (!refs.length && fallbackFirst) push(fallbackFirst);

  return { referenceImages: refs.slice(0, SEEDANCE_MAX_REFS) };
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
    const disableStoryboard = !!body.disable_storyboard;
    const disableReferences = !!body.disable_references;
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

    // ============ 逐镜渲染路径(每个分镜 = 1 段,完成后由前端拼接) ============

    const subScripts = splitScript(script);
    const segmentTotal = subScripts.length;
    console.log("[render multi] split into", segmentTotal, "segments, submitting in parallel");

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

    // 2) 并行提交所有段(每段带 3 级真人内容降级链)
    const isSensitive = (err?: string, raw?: any) => {
      const code = raw?.error?.code || '';
      const msg = (err || '') + ' ' + (raw?.error?.message || '');
      return /InputImageSensitiveContent|may contain real person|PrivacyInformation|sensitive/i.test(code + ' ' + msg);
    };
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
      // L0: 全量 reference
      let r = await submitArkTask({
        arkKey: ARK_KEY, model, prompt, ratio, duration, resolution,
        referenceImages: imgs.referenceImages,
      });
      // L1: 只留第一张参考(通常是 storyboard 静帧 / 角色板)
      if (!r.ok && isSensitive(r.error, (r as any).raw) && imgs.referenceImages.length > 1) {
        fallbackNotes.push('references_trimmed_for_safety');
        r = await submitArkTask({
          arkKey: ARK_KEY, model, prompt, ratio, duration, resolution,
          referenceImages: imgs.referenceImages.slice(0, 1),
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
    }));
    const { error: childErr } = await admin.from("marketing_video_jobs").insert(childRows);
    if (childErr) {
      console.error("[render multi] children insert", childErr);
      return json({ ok: false, error: "子任务入库失败: " + childErr.message });
    }

    // 5) 占位 marketing_assets
    const totalRefImages = submissions.reduce((s, x) => s + x.imgs.referenceImages.length, 0);
    const anyFirst = submissions.some((s) => !!s.imgs.firstImage);
    const fallbackWarnings = Array.from(new Set(submissions.flatMap((s) => s.fallbackNotes)));
    await admin.from("marketing_assets").insert({
      user_id: u.user.id, kind: "video", shop_id: shopId,
      input_image_urls: imageUrls, output_url: null,
      meta: {
        job_id: parent.id, video_type: script.video_type,
        duration: totalDur, aspect: ratio,
        mode: anyFirst ? "image2video" : (totalRefImages > 0 ? "reference2video" : "text2video"),
        render_mode: "per_shot",
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
            first: s.imgs.firstImage || null,
            last: s.imgs.lastImage || null,
          })),
        },
      },
    });



    return json({
      ok: true, success: true, job_id: parent.id, status: "running",
      segment_total: segmentTotal, child_task_ids: childTaskIds,
    });
  } catch (e) {
    console.error("[render] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

// 提交视频渲染任务到火山方舟 Seedance 2.0 API。
// 单段 ≤15s 直出,不再拼接;>15s 才会拆段(目前 surprise/标准生成都锁 15s,基本走单段)。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";
import { pickSegmentImages, type ScriptLike } from "../_shared/marketing-segments.ts";
import { resolveSeedanceModel, clampResolution, DEFAULT_SEEDANCE_2, SEEDANCE_MAX_SINGLE_SHOT } from "../_shared/seedance-models.ts";
import { normalizeRealism, type Realism } from "../_shared/realism.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const MAX_SEG_DUR = SEEDANCE_MAX_SINGLE_SHOT; // 单段渲染上限(秒)= 15

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

// 把脚本按时长贪心切成 N 个子脚本,每段 ≤ MAX_SEG_DUR 秒。
// hook 强制进第一段,outro 强制进最后一段。
function splitScript(script: any): any[] {
  const hook = script.hook;
  const outro = script.outro;
  const mids: any[] = Array.isArray(script.scenes) ? [...script.scenes] : [];

  // 把 hook/outro 也按"镜头"处理参与装箱,以便统一时长计算。
  const all: any[] = [];
  if (hook) all.push({ ...hook, __role: 'hook' });
  for (const m of mids) all.push({ ...m, __role: 'mid' });
  if (outro) all.push({ ...outro, __role: 'outro' });

  const buckets: any[][] = [];
  let cur: any[] = [];
  let curDur = 0;
  for (const sc of all) {
    let d = Number(sc.duration_s) || 2;
    if (d > MAX_SEG_DUR) d = MAX_SEG_DUR;
    sc.duration_s = d;
    if (curDur + d > MAX_SEG_DUR && cur.length > 0) {
      buckets.push(cur);
      cur = [];
      curDur = 0;
    }
    cur.push(sc);
    curDur += d;
  }
  if (cur.length) buckets.push(cur);

  // 兜底:至少一段
  if (!buckets.length) buckets.push([]);

  // 构造子脚本
  return buckets.map((bucket, i) => {
    const isFirst = i === 0;
    const isLast = i === buckets.length - 1;
    let subHook: any = null;
    let subOutro: any = null;
    const subScenes: any[] = [];
    bucket.forEach((sc) => {
      const role = sc.__role;
      const clean = { ...sc };
      delete clean.__role;
      if (role === 'hook' && isFirst && !subHook) subHook = clean;
      else if (role === 'outro' && isLast && !subOutro) subOutro = clean;
      else subScenes.push(clean);
    });
    // 必须有 hook + outro 才能通过下游校验,这里给占位空对象。
    if (!subHook) subHook = { duration_s: 0, scene: '', action: '', dialogue: '', subtitle: '' };
    if (!subOutro) subOutro = { duration_s: 0, scene: '', action: '', dialogue: '', subtitle: '' };
    const dur = bucket.reduce((s, x) => s + (Number(x.duration_s) || 0), 0);
    return {
      ...script,
      hook: subHook,
      scenes: subScenes,
      outro: subOutro,
      total_duration_s: Math.max(4, Math.min(MAX_SEG_DUR, Math.round(dur))),
      __segment_index: i,
      __segment_total: buckets.length,
    };
  });
}

async function submitArkTask(opts: {
  arkKey: string; model: string; prompt: string; ratio: string; duration: number;
  resolution: string;
  firstImage?: string; lastImage?: string; referenceImages?: string[];
}): Promise<{ ok: true; id: string; mode: string } | { ok: false; error: string; raw?: unknown }> {
  const content: any[] = [{ type: "text", text: opts.prompt }];
  // Seedance 2.0 接口约束:last_frame 与 reference_image 互斥(同一请求只能出现其中一类)。
  // 策略:
  //  - 同时有 first+last(分镜静帧驱动)→ 走 frames 模式,丢弃 reference_image
  //  - 只有 first → 可与 reference_image 共存
  //  - 都没有 → 走 reference 模式
  const refsAll = (opts.referenceImages || []).filter(Boolean);
  const hasFirst = !!opts.firstImage;
  const hasLast = !!opts.lastImage && opts.lastImage !== opts.firstImage;
  const useFramesOnly = hasFirst && hasLast; // 互斥时优先 frames
  const refs = useFramesOnly ? [] : refsAll;

  for (const url of refs.slice(0, 2)) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  if (hasFirst) {
    content.push({ type: "image_url", image_url: { url: opts.firstImage! }, role: "first_frame" });
  }
  if (hasLast) {
    content.push({ type: "image_url", image_url: { url: opts.lastImage! }, role: "last_frame" });
  }
  const mode = useFramesOnly
    ? "first_last_frame"
    : hasFirst
      ? (refs.length ? "image2video+reference" : "image2video")
      : (refs.length ? "reference2video" : "text2video");

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

/** 组装某段的图片三件套:角色参考图(每段都带)+ 段内 first/last。
 *  优先用 clip.storyboard_url(分镜静帧),没有再回退到原实景素材。 */
function resolveSegmentImages(
  sub: ScriptLike,
  imageUrls: string[],
  character: { cover_url?: string; extra_reference_urls?: string[] } | null,
  fallbackFirst?: string,
): { firstImage?: string; lastImage?: string; referenceImages: string[] } {
  // 1) 收集本段内 clips 顺序(hook → scenes → outro)
  const seq: any[] = [];
  if (sub.hook && (sub.hook.scene || sub.hook.action || sub.hook.storyboard_url)) seq.push(sub.hook);
  if (Array.isArray(sub.scenes)) seq.push(...sub.scenes);
  if (sub.outro && (sub.outro.scene || sub.outro.action || sub.outro.storyboard_url)) seq.push(sub.outro);

  // 2) 先按 storyboard_url 找首/尾帧
  const sbUrls: string[] = [];
  for (const sc of seq) {
    if (sc && typeof sc.storyboard_url === 'string' && sc.storyboard_url) sbUrls.push(sc.storyboard_url);
  }
  let firstImage: string | undefined;
  let lastImage: string | undefined;
  if (sbUrls.length) {
    firstImage = sbUrls[0];
    if (sbUrls.length > 1) lastImage = sbUrls[sbUrls.length - 1];
  } else {
    // 3) 没有静帧 → 老逻辑,从实景素材里挑
    const picks = pickSegmentImages(sub);
    if (picks.firstIndex !== null) firstImage = imageUrls[picks.firstIndex];
    if (picks.lastIndex !== null) lastImage = imageUrls[picks.lastIndex];
  }

  // 4) reference 永远塞角色身份板 + 段内绑定的实景照(锁人物 + 锁商品)
  const refSet = new Set<string>();
  if (character?.cover_url) refSet.add(character.cover_url);
  for (const u of character?.extra_reference_urls || []) if (u) refSet.add(u);
  const picks = pickSegmentImages(sub);
  for (const i of picks.refIndices) if (imageUrls[i]) refSet.add(imageUrls[i]);
  // 把段内绑定的实景照也加进 reference,即使被静帧顶掉了 first/last,
  // 模型也能看到真实店铺/商品样子
  for (const sc of seq) {
    const idx = typeof sc?.image_index === 'number' ? sc.image_index : null;
    if (idx !== null && imageUrls[idx]) refSet.add(imageUrls[idx]);
  }

  return {
    firstImage: firstImage || fallbackFirst,
    lastImage: lastImage && lastImage !== firstImage ? lastImage : undefined,
    referenceImages: Array.from(refSet).slice(0, 3),
  };
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

    // ============ 单段路径(≤15s 全部走这里,杜绝拼接) ============
    // 🚀 关键改造:先入库 + 立刻返回 job_id,ARK 提交放后台跑,避免前端 "Failed to fetch"。
    if (totalDur <= MAX_SEG_DUR) {
      const prompt = buildPrompt(script, styleKey, shopBlock, undefined, character, realism);
      const duration = clampDuration(totalDur || MAX_SEG_DUR);
      const effectiveCharacter = disableReferences ? null : character;
      const imgs = resolveSegmentImages(script, imageUrls, effectiveCharacter, disableReferences ? undefined : fallbackFirst);
      if (disableReferences) imgs.referenceImages = [];
      const _hasFirst = !!imgs.firstImage;
      const _hasLast = !!imgs.lastImage && imgs.lastImage !== imgs.firstImage;
      const _mode = _hasFirst && _hasLast ? "frames" : _hasFirst ? "image2video" : imgs.referenceImages.length ? "reference" : "text";
      console.log("[render single] model=", model, "res=", resolution, "mode=", _mode, "ref=", imgs.referenceImages.length);

      // 1) 立刻入库占位行
      const { data: job, error: jErr } = await admin.from("marketing_video_jobs").insert({
        user_id: u.user.id, script, status: "queued", shop_id: shopId,
        provider: "volcengine_seedance", provider_task_id: null,
      }).select().single();
      if (jErr || !job) {
        console.error("[render] job insert", jErr);
        return json({ ok: false, error: "排队失败: " + (jErr?.message || '未知') });
      }

      // 2) marketing_assets 占位(便于素材库立刻看到一张"渲染中")
      await admin.from("marketing_assets").insert({
        user_id: u.user.id, kind: "video", shop_id: shopId,
        input_image_urls: imageUrls, output_url: null,
        meta: {
          job_id: job.id, task_id: null, video_type: script.video_type,
          duration, aspect: ratio, mode: _mode, resolution,
          topic: script.topic || "", style: styleKey,
          style_label: VIDEO_STYLE_LABELS[styleKey], model,
          model_label: modelInfo.label, status: "queued",
          segment_total: 1, character_id: character?.id || null,
          character_name: character?.name || null,
          warnings: resolutionDowngraded ? ["resolution_downgraded"] : [],
          image_usage: {
            reference_count: imgs.referenceImages.length,
            first: imgs.firstImage || null, last: imgs.lastImage || null,
          },
        },
      });

      // 3) 后台跑 ARK 提交(带真人内容降级链)
      const submitInBackground = async () => {
        const isSensitive = (err?: string, raw?: any) => {
          const code = raw?.error?.code || '';
          const msg = (err || '') + ' ' + (raw?.error?.message || '');
          return /InputImageSensitiveContent|may contain real person|PrivacyInformation|sensitive/i.test(code + ' ' + msg);
        };
        const fallbackNotes: string[] = [];
        let r = await submitArkTask({
          arkKey: ARK_KEY, model, prompt, ratio, duration, resolution,
          firstImage: imgs.firstImage, lastImage: imgs.lastImage, referenceImages: imgs.referenceImages,
        });
        if (!r.ok && isSensitive(r.error, (r as any).raw)) {
          fallbackNotes.push("frames_dropped_for_safety");
          r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration, resolution, referenceImages: imgs.referenceImages });
        }
        if (!r.ok && isSensitive(r.error, (r as any).raw)) {
          fallbackNotes.push("references_dropped_for_safety");
          r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration, resolution });
        }
        if (!r.ok) {
          console.error("[render bg] ark error", r.error);
          await admin.from("marketing_video_jobs").update({ status: "failed", error: r.error }).eq("id", job.id);
          return;
        }
        await admin.from("marketing_video_jobs").update({ provider_task_id: r.id, status: "queued" }).eq("id", job.id);
        if (fallbackNotes.length) {
          // 把降级标记追加到 marketing_assets.meta(尽力,不阻塞)
          try {
            const { data: a } = await admin.from("marketing_assets").select("id, meta").eq("meta->>job_id", job.id).maybeSingle();
            if (a) {
              const m: any = a.meta || {};
              m.task_id = r.id;
              m.warnings = [...(m.warnings || []), ...fallbackNotes];
              await admin.from("marketing_assets").update({ meta: m }).eq("id", a.id);
            }
          } catch (_) { /* ignore */ }
        }
      };
      // @ts-ignore EdgeRuntime is provided by Supabase
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(submitInBackground());
      } else {
        // 兜底:同步等(本地开发)
        await submitInBackground();
      }

      return json({ ok: true, success: true, job_id: job.id, status: "queued", segment_total: 1 });
    }

    // ============ 多段路径(并行提交) ============
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

    // 2) 并行提交所有段
    const submissions = await Promise.all(subScripts.map((sub, i) => {
      const label = `第 ${i + 1} 段 / 共 ${segmentTotal} 段`;
      const prompt = buildPrompt(sub, styleKey, shopBlock, label, character, realism);
      const duration = clampDuration(sub.total_duration_s || MAX_SEG_DUR);
      // 只有第 1 段在完全无图时兜底用 image_urls[0],其他段不强塞
      const segFallback = i === 0 && !disableReferences ? fallbackFirst : undefined;
      const effectiveCharacter = disableReferences ? null : character;
      const imgs = resolveSegmentImages(sub, imageUrls, effectiveCharacter, segFallback);
      if (disableReferences) imgs.referenceImages = [];
      console.log(`[render multi] seg ${i + 1}/${segmentTotal} ref=${imgs.referenceImages.length} first=${imgs.firstImage || "none"} last=${imgs.lastImage || "none"}`);
      return submitArkTask({
        arkKey: ARK_KEY, model, prompt, ratio, duration, resolution,
        firstImage: imgs.firstImage, lastImage: imgs.lastImage, referenceImages: imgs.referenceImages,
      }).then((r) => ({ i, r, sub, duration, imgs }));
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
    await admin.from("marketing_assets").insert({
      user_id: u.user.id, kind: "video", shop_id: shopId,
      input_image_urls: imageUrls, output_url: null,
      meta: {
        job_id: parent.id, video_type: script.video_type,
        duration: totalDur, aspect: ratio,
        mode: anyFirst ? "image2video" : (totalRefImages > 0 ? "reference2video" : "text2video"),
        topic: script.topic || "", style: styleKey,
        style_label: VIDEO_STYLE_LABELS[styleKey], model, model_label: modelInfo.label, resolution,
        warnings: resolutionDowngraded ? ["resolution_downgraded"] : [],
        status: "running", segment_total: segmentTotal, segment_done: 0,
        stage: "generating", character_id: character?.id || null,
        character_name: character?.name || null,
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

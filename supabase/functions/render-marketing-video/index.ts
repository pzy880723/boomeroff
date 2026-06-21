// 提交视频渲染任务到火山方舟 Seedance API。
// 单段(≤12s)走单任务;长视频会自动按 ≤10s 拆成多段子任务,父任务汇总,
// 全部段完成后由客户端用 mediabunny 拼接成一支 MP4。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeStyle, VIDEO_STYLE_EN, VIDEO_STYLE_LABELS, type VideoStyleKey } from "../_shared/video-styles.ts";
import { loadShopContext, formatShopContext } from "../_shared/shop-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const DEFAULT_MODEL = "doubao-seedance-1-5-pro-251215";
const MAX_SEG_DUR = 10; // 单段渲染上限(秒),给 Seedance 留余量

function buildPrompt(script: any, styleKey: VideoStyleKey, shopBlock: string, segLabel?: string, character?: any): string {
  const styleEn = VIDEO_STYLE_EN[styleKey];
  const lines: string[] = [];
  lines.push(`严格按以下分镜拍摄,不要增加、删减或调换镜头顺序。`);
  if (character?.name) {
    lines.push(`【主角锁定】每段必须出现同一主角:${character.name}(${character.role_label || '主角'})。外观锁:${character.visual_signature || '以首帧参考身份板为准'}。面部、发型、服装、体型、年龄、气质严格一致,严禁换人或换装。`);
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
    if (dialogue) parts.push(`台词(同步口型/画外音):"${dialogue}"`);
    if (subtitle) parts.push(`屏幕字幕(中文叠加):"${subtitle}"`);
    lines.push(parts.join(' '));
  };

  if (script.hook) pushShot('开场', script.hook);
  if (Array.isArray(script.scenes)) {
    script.scenes.forEach((sc: any, i: number) => pushShot(`镜头${i + 1}`, sc));
  }
  if (script.outro) pushShot('收尾', script.outro);

  const out = lines.join('\n');
  return out.length > 1800 ? out.slice(0, 1800) : out;
}

function clampDuration(d: any): number {
  const n = Number(d) || 5;
  if (n < 4) return 4;
  if (n > 12) return 12;
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
  firstImage?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; raw?: unknown }> {
  const content: any[] = [{ type: "text", text: opts.prompt }];
  if (opts.firstImage) {
    content.push({ type: "image_url", image_url: { url: opts.firstImage }, role: "first_frame" });
  }
  const arkBody: Record<string, unknown> = {
    model: opts.model,
    content,
    resolution: "720p",
    ratio: opts.ratio,
    duration: opts.duration,
    watermark: false,
  };
  if (/seedance-(1-5|2)/i.test(opts.model)) {
    arkBody.generate_audio = true;
  }
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
  return { ok: true, id: arkJson.id };
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
    const script = body.script;
    if (!script || !script.hook || !Array.isArray(script.scenes) || !script.outro) {
      return json({ ok: false, error: "脚本格式不完整" });
    }

    const styleKey = normalizeStyle(body.style || script.style);
    const shopId: string | null = typeof body.shop_id === "string" && body.shop_id ? body.shop_id : null;
    const shopCtx = await loadShopContext(shopId);
    const shopBlock = formatShopContext(shopCtx);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: presets } = await admin.from("marketing_presets").select("value").eq("key", "video_model").maybeSingle();
    const model = (presets?.value as any)?.id || DEFAULT_MODEL;

    const ratio = normalizeRatio(script.aspect);
    const totalDur = Number(script.total_duration_s) || 0;
    const imageUrls: string[] = Array.isArray(script.image_urls) ? script.image_urls : [];
    const character = (script.character && typeof script.character === "object") ? script.character : null;
    const characterCover: string | undefined = character?.cover_url;
    const firstImage = imageUrls[0] || characterCover;

    // ============ 单段路径 ============
    if (totalDur <= MAX_SEG_DUR + 2) {
      const prompt = buildPrompt(script, styleKey, shopBlock, undefined, character);
      const duration = clampDuration(totalDur || MAX_SEG_DUR);
      const r = await submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration, firstImage });
      if (!r.ok) {
        console.error("[render single] ark error", r.error, r.raw);
        return json({ ok: false, error: r.error, raw: r.raw });
      }
      const { data: job, error: jErr } = await admin.from("marketing_video_jobs").insert({
        user_id: u.user.id,
        script,
        status: "queued",
        shop_id: shopId,
        provider: "volcengine_seedance",
        provider_task_id: r.id,
      }).select().single();
      if (jErr) {
        console.error("[render] job insert", jErr);
        return json({ ok: false, error: "排队失败: " + jErr.message });
      }
      await admin.from("marketing_assets").insert({
        user_id: u.user.id,
        kind: "video",
        shop_id: shopId,
        input_image_urls: imageUrls,
        output_url: null,
        meta: {
          job_id: job.id, task_id: r.id, video_type: script.video_type,
          duration, aspect: ratio, mode: firstImage ? "image2video" : "text2video",
          topic: script.topic || "", style: styleKey,
          style_label: VIDEO_STYLE_LABELS[styleKey], model, status: "queued",
          segment_total: 1, character_id: character?.id || null,
          character_name: character?.name || null,
        },
      });
      return json({ ok: true, success: true, job_id: job.id, task_id: r.id, status: "queued", segment_total: 1 });
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
      const prompt = buildPrompt(sub, styleKey, shopBlock, label, character);
      const duration = clampDuration(sub.total_duration_s || MAX_SEG_DUR);
      const useFirst = characterCover || (i === 0 ? firstImage : undefined);
      return submitArkTask({ arkKey: ARK_KEY, model, prompt, ratio, duration, firstImage: useFirst })
        .then((r) => ({ i, r, sub, duration }));
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
    await admin.from("marketing_assets").insert({
      user_id: u.user.id, kind: "video", shop_id: shopId,
      input_image_urls: imageUrls, output_url: null,
      meta: {
        job_id: parent.id, video_type: script.video_type,
        duration: totalDur, aspect: ratio,
        mode: firstImage ? "image2video" : "text2video",
        topic: script.topic || "", style: styleKey,
        style_label: VIDEO_STYLE_LABELS[styleKey], model,
        status: "running", segment_total: segmentTotal, segment_done: 0,
        stage: "generating", character_id: character?.id || null,
        character_name: character?.name || null,
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

// 单段 Seedance 2.0 提交器:一次只提交 1 个视频分段,避免边缘函数 CPU 超限。
// 只在服务端使用,输入来自已入库的 marketing_video_jobs 子任务。

import { SEEDANCE_MAX_REFS } from "./seedance-models.ts";

const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";

export type FacePipeline = 'auto' | 'character_sheet' | 'illustration' | 'faceless';

export interface SubmitSegmentOptions {
  arkKey: string;
  admin: any;
  userId: string;
  model: string;
  prompt: string;
  ratio: string;
  duration: number;
  resolution: string;
  referenceImages?: string[];
  facePipeline?: FacePipeline;
}

export interface SubmitSegmentResult {
  ok: boolean;
  id?: string;
  mode?: string;
  duration?: number;
  error?: string;
  raw?: unknown;
  fallbackNotes: string[];
  referenceCount: number;
}

function snapR2vDuration(d: number): number {
  const n = Math.round(Number(d) || 5);
  return n <= 7 ? 5 : 10;
}

function isSensitive(err?: string, raw?: any) {
  const code = raw?.error?.code || '';
  const msg = (err || '') + ' ' + (raw?.error?.message || '');
  return /InputImageSensitiveContent|may contain real person|PrivacyInformation|sensitive/i.test(code + ' ' + msg);
}

async function submitArkTask(opts: {
  arkKey: string;
  model: string;
  prompt: string;
  ratio: string;
  duration: number;
  resolution: string;
  referenceImages?: string[];
}): Promise<{ ok: true; id: string; mode: string; duration: number } | { ok: false; error: string; raw?: unknown }> {
  const content: any[] = [{ type: "text", text: opts.prompt }];
  const refs = (opts.referenceImages || []).filter(Boolean).slice(0, SEEDANCE_MAX_REFS);
  for (const url of refs) {
    content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
  }
  const mode = refs.length ? "reference2video" : "text2video";
  const effectiveDuration = mode === "reference2video" ? snapR2vDuration(opts.duration) : Math.round(Number(opts.duration) || 5);

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

async function softPassKeyReferences(
  urls: string[],
  opts: { admin: any; userId: string; max?: number },
): Promise<string[]> {
  const max = Math.max(1, Math.min(1, opts.max ?? 1));
  const verified = urls.filter((u) => typeof u === 'string' && u.startsWith('asset://')).slice(0, 1);
  // 已经有火山官方私域素材(asset://)时,不要再在 Edge Function 里处理真人照片。
  // 这样既符合官方真人认证方案,也避免图片解码/重编码触发 WORKER_RESOURCE_LIMIT。
  if (verified.length) return verified.slice(0, SEEDANCE_MAX_REFS);
  const httpRefs = urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, max);
  if (!httpRefs.length) return (verified.length ? verified : urls.slice(0, 1)).slice(0, SEEDANCE_MAX_REFS);

  const { softPassFaceImage } = await import("./face-gateway.ts");
  const marked = await Promise.all(httpRefs.map(async (u) => {
    try { return await softPassFaceImage(u, { admin: opts.admin, userId: opts.userId }); }
    catch (e) { console.warn("[segment-submit] soft-pass failed, keep original", (e as any)?.message); return u; }
  }));
  const out = [...verified, ...marked].filter(Boolean);
  return (out.length ? out : urls.slice(0, 1)).slice(0, SEEDANCE_MAX_REFS);
}

export async function submitSeedanceSegment(opts: SubmitSegmentOptions): Promise<SubmitSegmentResult> {
  const fallbackNotes: string[] = [];
  const facePipeline = opts.facePipeline || 'auto';
  let effectiveRefs = (opts.referenceImages || []).filter(Boolean).slice(0, SEEDANCE_MAX_REFS);

  if (facePipeline === 'character_sheet' && effectiveRefs.length) {
    effectiveRefs = await softPassKeyReferences(effectiveRefs, { admin: opts.admin, userId: opts.userId, max: 1 });
    fallbackNotes.push('face_soft_pass_applied');
  } else if (facePipeline === 'faceless') {
    effectiveRefs = effectiveRefs.filter((u) => !/avatar|face|character|portrait/i.test(u)).slice(0, 2);
    fallbackNotes.push('references_trimmed_for_safety');
  }

  let r = await submitArkTask({ ...opts, referenceImages: effectiveRefs });

  if (!r.ok && isSensitive(r.error, (r as any).raw) && effectiveRefs.length && facePipeline !== 'character_sheet') {
    const marked = await softPassKeyReferences(effectiveRefs, { admin: opts.admin, userId: opts.userId, max: 1 });
    fallbackNotes.push('face_soft_pass_auto');
    r = await submitArkTask({ ...opts, referenceImages: marked });
    if (r.ok) effectiveRefs = marked;
  }

  if (!r.ok && isSensitive(r.error, (r as any).raw) && effectiveRefs.length > 1) {
    fallbackNotes.push('references_trimmed_for_safety');
    r = await submitArkTask({ ...opts, referenceImages: effectiveRefs.slice(0, 1) });
  }

  if (!r.ok && isSensitive(r.error, (r as any).raw)) {
    fallbackNotes.push('references_dropped_for_safety');
    r = await submitArkTask({ ...opts, referenceImages: [] });
  }

  if (!r.ok) {
    return { ok: false, error: r.error, raw: (r as any).raw, fallbackNotes, referenceCount: effectiveRefs.length };
  }

  return {
    ok: true,
    id: r.id,
    mode: r.mode,
    duration: r.duration,
    fallbackNotes,
    referenceCount: effectiveRefs.length,
  };
}
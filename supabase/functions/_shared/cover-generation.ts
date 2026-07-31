// 一键视频完成后的「全新封面」生成任务共享逻辑。
// 说明:
// - marketing_video_jobs.fallback_notes 历史上一直是 string[](渲染降级提示)。
//   这里统一为“可对象化”的形态:{ notes: string[], cover_generation: {...}, ...其它键 }
//   旧任务(数组 / null)必须能被无损读写。
// - 严禁把视频帧/第一帧当作封面:参考帧只交给腾讯云 Worker 做人脸识别后喂 Seedream。

export type CoverStatus = "queued" | "claimed" | "generating" | "succeeded" | "failed";

export interface CoverCopy {
  headline: string;
  subtitle: string;
  highlight_keyword: string;
}

export interface CoverVariation {
  action: string;
  product: string;
  camera: string;
  people_count: number;
}

export interface CoverGeneration {
  status: CoverStatus;
  copy: CoverCopy;
  variation: CoverVariation;
  copy_fingerprint: string;
  variation_key: string;
  queued_at?: string;
  worker_id?: string | null;
  claimed_at?: string | null;
  heartbeat_at?: string | null;
  progress?: { percent: number; stage: string; message: string } | null;
  cover_url?: string | null;
  reference_frame_count?: number | null;
  error?: string | null;
  finished_at?: string | null;
}

export interface NormalizedNotes {
  notes: string[];
  cover_generation: CoverGeneration | null;
  /** fallback_notes 上除 notes / cover_generation 之外的其它键,写回时必须保留 */
  extra: Record<string, unknown>;
}

/** 旧任务兼容:数组 / null / 对象 都能读 */
export function normalizeFallbackNotes(raw: unknown): NormalizedNotes {
  if (Array.isArray(raw)) {
    return { notes: raw.map((n) => String(n)), cover_generation: null, extra: {} };
  }
  if (raw && typeof raw === "object") {
    const obj = { ...(raw as Record<string, unknown>) };
    const notesRaw = obj.notes;
    delete obj.notes;
    const cover = obj.cover_generation;
    delete obj.cover_generation;
    return {
      notes: Array.isArray(notesRaw) ? notesRaw.map((n) => String(n)) : [],
      cover_generation: (cover && typeof cover === "object" ? cover as CoverGeneration : null),
      extra: obj,
    };
  }
  return { notes: [], cover_generation: null, extra: {} };
}

/** JSONB 合并:只改 cover_generation,其它键(含旧 notes 数组)原样保留 */
export function mergeCoverGeneration(
  raw: unknown,
  patch: Partial<CoverGeneration> | null,
): Record<string, unknown> {
  const { notes, cover_generation, extra } = normalizeFallbackNotes(raw);
  const merged: Record<string, unknown> = { ...extra, notes };
  if (patch === null) {
    if (cover_generation) merged.cover_generation = cover_generation;
    return merged;
  }
  merged.cover_generation = { ...(cover_generation || {}), ...patch };
  return merged;
}

export function readCoverGeneration(raw: unknown): CoverGeneration | null {
  return normalizeFallbackNotes(raw).cover_generation;
}

// ---------------- 指纹 / 变体 ----------------

function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + 0x9e3779b9, 2654435761) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}

export function copyFingerprint(copy: CoverCopy): string {
  return stableHash([
    copy.headline.trim(),
    copy.subtitle.trim(),
    copy.highlight_keyword.trim(),
  ].join("|"));
}

export function variationKey(v: CoverVariation): string {
  return [v.action, v.product, v.camera, `p${v.people_count}`]
    .map((s) => String(s).trim())
    .join("|");
}

const HEADLINES = [
  "这家店我不许你不知道",
  "下班顺路挖到的宝",
  "一进门就走不动路",
  "中古控的快乐星球",
  "藏在商场里的杂货铺",
  "逛完只想再逛一遍",
];
const SUBTITLES = [
  "随手一翻都是惊喜",
  "每一层都值得慢慢看",
  "翻着翻着就到打烊",
  "看一眼就想搬回家",
  "老物件的温柔时刻",
  "上头指数直接拉满",
];
const KEYWORDS = ["中古", "宝藏", "探店", "淘货", "复古", "惊喜"];
const ACTIONS = ["拿起端详", "回头微笑", "指向货架", "翻找中", "抬手比划", "低头挑选"];
const CAMERAS = ["中景平视", "低角度仰拍", "近景特写", "过肩跟拍", "斜侧中近景", "俯视桌面"];
const PEOPLE = [1, 1, 2];

const GENERIC_PRODUCTS = ["店内中古好物", "货架上的老物件", "复古小杂货"];

/** 商品只能来自本次脚本 / 已选素材,不杜撰品牌与门头 logo */
export function extractProducts(script: unknown, assets?: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!s || s.length > 20) return;
    if (!out.includes(s)) out.push(s);
  };
  const s = (script && typeof script === "object" ? script : {}) as Record<string, any>;
  push(s.hero_product);
  if (Array.isArray(s.products)) s.products.forEach(push);
  if (Array.isArray(s.shots)) {
    for (const shot of s.shots) push(shot?.product);
  }
  if (Array.isArray(assets)) {
    for (const a of assets) push((a as any)?.title || (a as any)?.meta?.title);
  }
  return out.length ? out : GENERIC_PRODUCTS.slice();
}

function pick<T>(arr: T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

export interface CoverPlanInput {
  jobId: string;
  script?: unknown;
  assets?: unknown;
  usedCopyFingerprints?: string[];
  usedVariationKeys?: string[];
}

/** 稳定但可避让碰撞的候选:同一 job 恒定起点,碰撞则顺延到下一个候选 */
export function buildCoverPlan(input: CoverPlanInput): { copy: CoverCopy; variation: CoverVariation; copy_fingerprint: string; variation_key: string } {
  const products = extractProducts(input.script, input.assets);
  const seedHex = stableHash(input.jobId);
  const seed = parseInt(seedHex.slice(0, 8), 16);
  const usedCopy = new Set(input.usedCopyFingerprints || []);
  const usedVar = new Set(input.usedVariationKeys || []);

  const maxTries = HEADLINES.length * SUBTITLES.length;
  let copy: CoverCopy | null = null;
  let fp = "";
  for (let i = 0; i < maxTries; i++) {
    const cand: CoverCopy = {
      headline: pick(HEADLINES, seed + i),
      subtitle: pick(SUBTITLES, seed + i * 2 + 1),
      highlight_keyword: pick(KEYWORDS, seed + i * 3 + 2),
    };
    const f = copyFingerprint(cand);
    copy = copy || cand;
    fp = fp || f;
    if (!usedCopy.has(f)) { copy = cand; fp = f; break; }
  }

  const maxVarTries = ACTIONS.length * CAMERAS.length * products.length;
  let variation: CoverVariation | null = null;
  let vk = "";
  for (let i = 0; i < maxVarTries; i++) {
    const cand: CoverVariation = {
      action: pick(ACTIONS, seed + i),
      product: pick(products, seed + i * 2 + 1),
      camera: pick(CAMERAS, seed + i * 3 + 1),
      people_count: pick(PEOPLE, seed + i),
    };
    const k = variationKey(cand);
    variation = variation || cand;
    vk = vk || k;
    if (!usedVar.has(k)) { variation = cand; vk = k; break; }
  }

  return { copy: copy!, variation: variation!, copy_fingerprint: fp, variation_key: vk };
}

/** 查询最近 90 天同店铺/同用户已使用过的指纹 */
export async function loadRecentSignatures(
  admin: any,
  opts: { shopId?: string | null; userId?: string | null; excludeJobId?: string },
): Promise<{ copy: string[]; variation: string[] }> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let q = admin
    .from("marketing_video_jobs")
    .select("id, fallback_notes")
    .gte("created_at", since)
    .not("fallback_notes->cover_generation", "is", null)
    .limit(500);
  if (opts.shopId) q = q.eq("shop_id", opts.shopId);
  else if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data } = await q;
  const copy: string[] = [];
  const variation: string[] = [];
  for (const row of data || []) {
    if (opts.excludeJobId && row.id === opts.excludeJobId) continue;
    const cg = readCoverGeneration(row.fallback_notes);
    if (!cg) continue;
    if (cg.copy_fingerprint) copy.push(cg.copy_fingerprint);
    if (cg.variation_key) variation.push(cg.variation_key);
  }
  return { copy, variation };
}

/**
 * 视频成功后入队封面任务(幂等:已存在 cover_generation 就不动)。
 */
export async function ensureCoverQueued(
  admin: any,
  job: { id: string; user_id?: string | null; shop_id?: string | null; video_url?: string | null; script?: unknown; fallback_notes?: unknown },
): Promise<{ queued: boolean; reason?: string }> {
  if (!job?.id || !job.video_url) return { queued: false, reason: "no_video_url" };
  const existing = readCoverGeneration(job.fallback_notes);
  if (existing) return { queued: false, reason: "already_exists" };

  const used = await loadRecentSignatures(admin, {
    shopId: job.shop_id || null,
    userId: job.user_id || null,
    excludeJobId: job.id,
  });
  const plan = buildCoverPlan({
    jobId: job.id,
    script: job.script,
    usedCopyFingerprints: used.copy,
    usedVariationKeys: used.variation,
  });

  const patch: CoverGeneration = {
    status: "queued",
    copy: plan.copy,
    variation: plan.variation,
    copy_fingerprint: plan.copy_fingerprint,
    variation_key: plan.variation_key,
    queued_at: new Date().toISOString(),
    worker_id: null,
    progress: null,
    cover_url: null,
    error: null,
  };
  const merged = mergeCoverGeneration(job.fallback_notes, patch);
  const { data } = await admin
    .from("marketing_video_jobs")
    .update({ fallback_notes: merged })
    .eq("id", job.id)
    .is("fallback_notes->cover_generation", null)
    .select("id")
    .maybeSingle();
  return { queued: Boolean(data) };
}

/** poll-marketing-video 对外暴露的封面字段 */
export function coverPollFields(raw: unknown): {
  cover_status: CoverStatus | null;
  cover_url: string | null;
  cover_error: string | null;
  cover_progress: { percent: number; stage: string; message: string } | null;
} {
  const cg = readCoverGeneration(raw);
  if (!cg) return { cover_status: null, cover_url: null, cover_error: null, cover_progress: null };
  return {
    cover_status: cg.status || null,
    cover_url: cg.status === "succeeded" ? (cg.cover_url || null) : null,
    cover_error: cg.status === "failed" ? (cg.error || "封面生成失败") : null,
    cover_progress: cg.progress || null,
  };
}

/**
 * 封面 Worker 鉴权 token:优先专用 COVER_WORKER_TOKEN,
 * 缺失时复用生产发布 Worker 已有的 WORKER_SHARED_SECRET。
 * 两者都缺失返回 null(调用方返回 500)。
 */
export function resolveCoverWorkerToken(
  env: (k: string) => string | undefined = (k) => Deno.env.get(k),
): string | null {
  const dedicated = (env("COVER_WORKER_TOKEN") || "").trim();
  if (dedicated) return dedicated;
  const shared = (env("WORKER_SHARED_SECRET") || "").trim();
  if (shared) return shared;
  return null;
}

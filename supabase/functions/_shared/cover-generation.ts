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

const ACTIONS = ["拿起端详", "回头微笑", "指向货架", "翻找中", "抬手比划", "低头挑选"];
const CAMERAS = ["中景平视", "低角度仰拍", "近景特写", "过肩跟拍", "斜侧中近景", "俯视桌面"];
const PEOPLE = [1, 1, 2];

/** 只允许来自本次脚本 / 已选素材,不杜撰品牌与门头 logo */
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
  return out;
}

/** 脚本事实里的中性兜底短语:仍来自当前脚本,不引入新事实 */
function neutralProduct(script: unknown): string {
  const s = (script && typeof script === "object" ? script : {}) as Record<string, any>;
  const pc = (s.publish_copy && typeof s.publish_copy === "object" ? s.publish_copy : {}) as Record<string, any>;
  const firstTopic = Array.isArray(pc.topics) && pc.topics.length
    ? String(pc.topics[0]).replace(/^[#＃]+/, "").trim()
    : "";
  const candidates = [firstTopic, String(pc.title || "").trim(), String(s.title || "").trim(), String(s.topic || "").trim()];
  for (const c of candidates) {
    if (c) return c.slice(0, 20);
  }
  return "画面中出现的物品";
}

/** 封面文案只能来自当前脚本的 publish_copy / 脚本事实 */
function deriveCoverCopy(script: unknown): CoverCopy {
  const s = (script && typeof script === "object" ? script : {}) as Record<string, any>;
  const pc = (s.publish_copy && typeof s.publish_copy === "object" ? s.publish_copy : {}) as Record<string, any>;
  const headline = String(pc.title || s.title || s.topic || "").trim();
  const bodyRaw = String(pc.body || s.continuous_dialogue || "").trim();
  const firstSentence = bodyRaw.split(/[。！？!?\n，,]/).map((x) => x.trim()).filter(Boolean)[0] || "";
  const subtitle = (firstSentence && firstSentence !== headline ? firstSentence : bodyRaw).slice(0, 24);
  const topic0 = Array.isArray(pc.topics) && pc.topics.length
    ? String(pc.topics[0]).replace(/^[#＃]+/, "").trim()
    : "";
  const highlight = topic0 || headline.slice(0, 4);
  return { headline, subtitle, highlight_keyword: highlight };
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

/** 文案完全由当前脚本事实决定;只有画面变体在池中避让碰撞 */
export function buildCoverPlan(input: CoverPlanInput): { copy: CoverCopy; variation: CoverVariation; copy_fingerprint: string; variation_key: string } {
  const productsRaw = extractProducts(input.script, input.assets);
  const products = productsRaw.length ? productsRaw : [neutralProduct(input.script)];
  const seedHex = stableHash(input.jobId);
  const seed = parseInt(seedHex.slice(0, 8), 16);
  const usedVar = new Set(input.usedVariationKeys || []);

  const copy = deriveCoverCopy(input.script);
  const fp = copyFingerprint(copy);

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

/** poll-marketing-video 对外暴露的封面 + 发布文案字段 */
export function coverPollFields(raw: unknown, script?: unknown): {
  cover_status: CoverStatus | null;
  cover_url: string | null;
  cover_error: string | null;
  cover_progress: { percent: number; stage: string; message: string } | null;
  publish_copy: SurprisePublishCopy | null;
} {
  const s = (script && typeof script === "object" ? script : {}) as Record<string, any>;
  const publish_copy = s.publish_copy || s.title || s.continuous_dialogue
    ? normalizePublishCopy(s.publish_copy, {
        title: String(s.title || s.topic || "").trim(),
        body: String(s.continuous_dialogue || "").trim(),
      })
    : null;
  const cg = readCoverGeneration(raw);
  if (!cg) return { cover_status: null, cover_url: null, cover_error: null, cover_progress: null, publish_copy };
  return {
    cover_status: cg.status || null,
    cover_url: cg.status === "succeeded" ? (cg.cover_url || null) : null,
    cover_error: cg.status === "failed" ? (cg.error || "封面生成失败") : null,
    cover_progress: cg.progress || null,
    publish_copy,
  };
}


/**
 * 封面 Worker 鉴权 token:优先专用 COVER_WORKER_TOKEN,
 * 其次 WORKER_SHARED_SECRET,最后复用同一受控 Worker 主机的 COMPOSE_WORKER_TOKEN。
 * 全部缺失返回 null(调用方返回 500)。
 */
export function resolveCoverWorkerToken(
  env: (k: string) => string | undefined = (k) => Deno.env.get(k),
): string | null {
  for (const key of ["COVER_WORKER_TOKEN", "WORKER_SHARED_SECRET", "COMPOSE_WORKER_TOKEN"]) {
    const v = (env(key) || "").trim();
    if (v) return v;
  }
  return null;
}


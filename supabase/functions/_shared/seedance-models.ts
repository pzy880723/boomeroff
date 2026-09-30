// Seedance 模型清单(后端用)。与 src/lib/seedanceModels.ts 字段保持一致。
// 2.0 系列:r2v 时长吸附 5/10/15 秒,最多 9 张参考图。
// 2.5 系列:单次 4–30 秒任意整数,最多 50 个多模态参考素材。
export type SeedanceDurationMode = "snap_5_10_15" | "integer_range";

export interface SeedanceModelInfo {
  id: string;
  label: string;
  family: "2.0" | "2.5";
  min_duration: number;
  max_duration: number;
  duration_mode: SeedanceDurationMode;
  max_refs: number;
  resolutions: string[];           // lowercase: 720p / 1080p / 4k
  default_resolution: string;
  supports_audio: boolean;
}

export const SEEDANCE_2_5_ID = "doubao-seedance-2-5-260628";

export const SEEDANCE_MODELS: SeedanceModelInfo[] = [
  {
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0 Pro",
    family: "2.0",
    min_duration: 5,
    max_duration: 15,
    duration_mode: "snap_5_10_15",
    max_refs: 9,
    resolutions: ["720p", "1080p", "4k"],
    default_resolution: "1080p",
    supports_audio: true,
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    family: "2.0",
    min_duration: 5,
    max_duration: 15,
    duration_mode: "snap_5_10_15",
    max_refs: 9,
    // 火山 doubao-seedance-2-0-fast 仅支持 720p(r2v / t2v 都不接受 1080p)
    resolutions: ["720p"],
    default_resolution: "720p",
    supports_audio: true,
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    label: "Seedance 2.0 Mini",
    family: "2.0",
    min_duration: 5,
    max_duration: 15,
    duration_mode: "snap_5_10_15",
    max_refs: 9,
    resolutions: ["720p"],
    default_resolution: "720p",
    supports_audio: true,
  },
  {
    id: SEEDANCE_2_5_ID,
    label: "Seedance 2.5",
    family: "2.5",
    min_duration: 4,
    max_duration: 30,
    duration_mode: "integer_range",
    max_refs: 50,
    resolutions: ["480p", "720p", "1080p"],
    default_resolution: "720p",
    supports_audio: true,
  },
];

/** @deprecated 保留旧名,内容已包含 2.5 */
export const SEEDANCE_2_MODELS = SEEDANCE_MODELS;

export const DEFAULT_SEEDANCE_2 = "doubao-seedance-2-0-260128";
/** 2.0 单段物理上限。2.5 请用 model.max_duration。 */
export const SEEDANCE_MAX_SINGLE_SHOT = 15;
/** 2.0 reference_image 上限。2.5 请用 model.max_refs。改这里务必同步前端同名常量。 */
export const SEEDANCE_MAX_REFS = 9;
export const SEEDANCE_2_5_MAX_REFS = 50;

export class SeedanceModelError extends Error {
  status = 400;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SeedanceModelError";
    this.code = code;
  }
}

/** 空值 → 默认 2.0 Pro;非空但不在清单 → 抛 SeedanceModelError(400),绝不静默回退。 */
export function resolveSeedanceModel(requested?: string | null): SeedanceModelInfo {
  const id = typeof requested === "string" ? requested.trim() : "";
  if (!id) return SEEDANCE_MODELS[0];
  const hit = SEEDANCE_MODELS.find((m) => m.id === id);
  if (!hit) {
    throw new SeedanceModelError(
      "unknown_seedance_model",
      `未知视频模型: ${id}。可用: ${SEEDANCE_MODELS.map((m) => m.id).join(", ")}`,
    );
  }
  return hit;
}

export function isSeedance25(model: SeedanceModelInfo | string | null | undefined): boolean {
  const id = typeof model === "string" ? model : model?.id;
  return !!id && SEEDANCE_MODELS.find((m) => m.id === id)?.family === "2.5";
}

/** 提交层用:把任意时长归一到模型合法值(2.0 吸附 5/10/15;2.5 取整并夹在 4–30)。 */
export function normalizeSeedanceDuration(model: SeedanceModelInfo, d: unknown): number {
  const n = Math.round(Number(d) || model.min_duration);
  if (model.duration_mode === "snap_5_10_15") {
    if (n <= 7) return 5;
    if (n <= 12) return 10;
    return 15;
  }
  return Math.max(model.min_duration, Math.min(model.max_duration, n));
}

/** 请求入口用:显式传入的时长必须是模型能力内的合法整数,否则 400。2.0 仍按吸附规则接受。 */
export function validateSeedanceDuration(model: SeedanceModelInfo, d: unknown): number {
  const n = Number(d);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new SeedanceModelError("invalid_duration", `时长必须是整数秒: ${String(d)}`);
  }
  if (n < 1 || n > model.max_duration || (model.duration_mode === "integer_range" && n < model.min_duration)) {
    throw new SeedanceModelError(
      "invalid_duration",
      `${model.label} 单次时长范围 ${model.min_duration}–${model.max_duration} 秒,收到 ${n}`,
    );
  }
  return normalizeSeedanceDuration(model, n);
}

export function clampReferences<T>(model: SeedanceModelInfo, refs: T[]): T[] {
  return refs.slice(0, model.max_refs);
}

// 把任意输入归一化到该模型能力内的合法分辨率。
export function clampResolution(model: SeedanceModelInfo, requested: string): string {
  const r = (requested || "").toLowerCase();
  if (model.resolutions.includes(r)) return r;
  return model.default_resolution;
}

export function resolveSeedanceQuality(
  requestedModel?: string | null,
  requestedResolution?: string | null,
): {
  model: SeedanceModelInfo;
  requestedResolution: string;
  resolution: string;
  resolutionDowngraded: boolean;
} {
  const model = resolveSeedanceModel(requestedModel);
  const normalizedRequest = String(requestedResolution || model.default_resolution).toLowerCase();
  const resolution = clampResolution(model, normalizedRequest);
  return {
    model,
    requestedResolution: normalizedRequest,
    resolution,
    resolutionDowngraded: resolution !== normalizedRequest,
  };
}

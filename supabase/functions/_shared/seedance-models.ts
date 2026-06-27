// Seedance 2.0 系列模型清单(后端用)。与 src/lib/seedanceModels.ts 字段保持一致。
export interface SeedanceModelInfo {
  id: string;
  label: string;
  max_duration: number;
  resolutions: string[];           // lowercase: 720p / 1080p / 4k
  default_resolution: string;
  supports_audio: boolean;
}

export const SEEDANCE_2_MODELS: SeedanceModelInfo[] = [
  {
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0 Pro",
    max_duration: 15,
    resolutions: ["720p", "1080p", "4k"],
    default_resolution: "1080p",
    supports_audio: true,
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    max_duration: 15,
    resolutions: ["720p", "1080p"],
    default_resolution: "720p",
    supports_audio: true,
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    label: "Seedance 2.0 Mini",
    max_duration: 15,
    resolutions: ["720p", "1080p"],
    default_resolution: "720p",
    supports_audio: true,
  },
];

export const DEFAULT_SEEDANCE_2 = "doubao-seedance-2-0-260128";
export const SEEDANCE_MAX_SINGLE_SHOT = 15;
// Seedance 2.0 `reference_image` 通道最多支持 9 张图(对齐小云雀的一次成片体验)。
// 改这里务必同步前端 src/lib/seedanceModels.ts 中的同名常量。
export const SEEDANCE_MAX_REFS = 9;

export function resolveSeedanceModel(requested?: string | null): SeedanceModelInfo {
  if (!requested) return SEEDANCE_2_MODELS[0];
  return SEEDANCE_2_MODELS.find((m) => m.id === requested) || SEEDANCE_2_MODELS[0];
}

// 把任意输入归一化到该模型能力内的合法分辨率。
// 不支持的档(如 Fast 选 4K) → 回落到该模型 default_resolution。
export function clampResolution(model: SeedanceModelInfo, requested: string): string {
  const r = (requested || "").toLowerCase().replace("k", "k"); // "4K" → "4k"
  if (model.resolutions.includes(r)) return r;
  return model.default_resolution;
}

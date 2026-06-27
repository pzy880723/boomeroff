// Seedance 2.0 系列模型清单(前端用)。后端 _shared/seedance-models.ts 字段保持一致。
// 用户在生成视频前直接选择;选不到时默认走 Pro。
export type SeedanceResolution = "720p" | "1080p" | "4K";

export interface SeedanceModel {
  id: string;
  label: string;
  tagline: string;
  max_duration: number;
  resolutions: SeedanceResolution[];
  default_resolution: SeedanceResolution;
  supports_audio: boolean;
  speed: string;
  cost: string;
  best_for: string;
  available: boolean;
  available_at?: string;
  recommended?: boolean;
}

export const SEEDANCE_2_MODELS: SeedanceModel[] = [
  {
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0 Pro",
    tagline: "画质最强",
    max_duration: 15,
    resolutions: ["720p", "1080p", "4K"],
    default_resolution: "1080p",
    supports_audio: true,
    speed: "标准",
    cost: "高",
    best_for: "成片、对外发布、需要 1080p/4K",
    available: true,
    recommended: true,
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    tagline: "更快更便宜 · 仅 720p",
    max_duration: 15,
    resolutions: ["720p"],
    default_resolution: "720p",
    supports_audio: true,
    speed: "快(约 1/2 用时)",
    cost: "中",
    best_for: "日常短视频、批量出片(仅 720p)",
    available: true,
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    label: "Seedance 2.0 Mini",
    tagline: "最便宜 · 测试稿 · 仅 720p",
    max_duration: 15,
    resolutions: ["720p"],
    default_resolution: "720p",
    supports_audio: true,
    speed: "最快",
    cost: "最低",
    best_for: "测试稿、灵感稿(仅 720p)",
    available: false,
    available_at: "2026-06-25",
  },
];

export const DEFAULT_SEEDANCE_2 = "doubao-seedance-2-0-260128";
export const SEEDANCE_MAX_SINGLE_SHOT = 15;
// 一次成片模式下,reference_image 通道最多 9 张。与后端 _shared/seedance-models.ts 同步。
export const SEEDANCE_MAX_REFS = 9;
export const ALL_RESOLUTIONS: SeedanceResolution[] = ["720p", "1080p", "4K"];

export function getSeedanceModel(id?: string | null): SeedanceModel {
  if (!id) return SEEDANCE_2_MODELS[0];
  return SEEDANCE_2_MODELS.find((m) => m.id === id) || SEEDANCE_2_MODELS[0];
}

export function getSeedanceShortLabel(id?: string | null): string {
  const m = getSeedanceModel(id);
  return m.label.replace(/^Seedance\s*2\.0\s*/i, '') || m.label;
}

// 切模型时,如果旧分辨率不在新模型能力内,回落到新模型推荐档。
export function reconcileResolution(modelId: string, current?: SeedanceResolution | null): SeedanceResolution {
  const m = getSeedanceModel(modelId);
  if (current && m.resolutions.includes(current)) return current;
  return m.default_resolution;
}

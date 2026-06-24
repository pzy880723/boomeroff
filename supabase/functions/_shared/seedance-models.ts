// Seedance 2.0 系列模型清单(后端用)。与 src/lib/seedanceModels.ts 字段保持一致。
export interface SeedanceModelInfo {
  id: string;
  label: string;
  max_duration: number;
  resolutions: string[];
  supports_audio: boolean;
}

export const SEEDANCE_2_MODELS: SeedanceModelInfo[] = [
  {
    id: "doubao-seedance-2-0-260128",
    label: "Seedance 2.0 Pro",
    max_duration: 15,
    resolutions: ["480p", "720p", "1080p", "4k"],
    supports_audio: true,
  },
  {
    id: "doubao-seedance-2-0-fast-260128",
    label: "Seedance 2.0 Fast",
    max_duration: 15,
    resolutions: ["480p", "720p"],
    supports_audio: true,
  },
  {
    id: "doubao-seedance-2-0-mini-260615",
    label: "Seedance 2.0 Mini",
    max_duration: 15,
    resolutions: ["480p", "720p"],
    supports_audio: true,
  },
];

export const DEFAULT_SEEDANCE_2 = "doubao-seedance-2-0-260128";
export const SEEDANCE_MAX_SINGLE_SHOT = 15;

export function resolveSeedanceModel(requested?: string | null): SeedanceModelInfo {
  if (!requested) return SEEDANCE_2_MODELS[0];
  return SEEDANCE_2_MODELS.find((m) => m.id === requested) || SEEDANCE_2_MODELS[0];
}

export function clampResolution(model: SeedanceModelInfo, requested: string): string {
  const r = requested.toLowerCase();
  if (model.resolutions.includes(r)) return r;
  // 降级:1080p/4k → 720p
  if (r === "1080p" || r === "4k") return model.resolutions.includes("720p") ? "720p" : model.resolutions[model.resolutions.length - 1];
  return "720p";
}

// 记住用户上一次选择的渲染模型 + 分辨率,跨「AI 自定义视频」与「惊喜一下」共享。
import { DEFAULT_SEEDANCE_2, getSeedanceModel, reconcileResolution, type SeedanceResolution } from './seedanceModels';

const KEY = 'boomer:video:model_prefs';

export type VideoModelPrefs = { modelId: string; resolution: SeedanceResolution };

export function getModelPrefs(): VideoModelPrefs {
  const fallback: VideoModelPrefs = {
    modelId: DEFAULT_SEEDANCE_2,
    resolution: getSeedanceModel(DEFAULT_SEEDANCE_2).default_resolution,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<VideoModelPrefs>;
    const m = getSeedanceModel(parsed.modelId);
    // 找不到对应模型时 getSeedanceModel 会回落默认,这里再保险一次
    const modelId = m?.id || DEFAULT_SEEDANCE_2;
    const resolution = reconcileResolution(modelId, parsed.resolution as SeedanceResolution | undefined);
    return { modelId, resolution };
  } catch {
    return fallback;
  }
}

export function saveModelPrefs(modelId: string, resolution: SeedanceResolution) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ modelId, resolution }));
  } catch { /* ignore quota / SSR */ }
}

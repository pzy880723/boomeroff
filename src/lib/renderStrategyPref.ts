// 渲染策略本地记忆:auto / one_shot / per_shot
// - auto:由后端根据脚本特征自动判断(默认)
// - one_shot:一次推理直出多镜(对齐小云雀,更快更自然,≤15s)
// - per_shot:每个分镜单独渲染,前端拼接(每镜可控,长视频必选)
export type RenderStrategy = 'auto' | 'one_shot' | 'per_shot';

const KEY = 'mv:render_strategy';
const DEFAULT: RenderStrategy = 'auto';

export function getRenderStrategy(): RenderStrategy {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'one_shot' || v === 'per_shot') return v;
  } catch {}
  return DEFAULT;
}

export function setRenderStrategy(v: RenderStrategy) {
  try { localStorage.setItem(KEY, v); } catch {}
}

export const STRATEGY_LABEL: Record<RenderStrategy, string> = {
  auto: '智能',
  one_shot: '一次成片',
  per_shot: '逐镜拼接',
};

export const STRATEGY_HINT: Record<RenderStrategy, string> = {
  auto: '后端自动判断,推荐',
  one_shot: '更快·更自然(≤15s)',
  per_shot: '每镜可控·更精准',
};

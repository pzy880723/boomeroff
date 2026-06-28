// 渲染策略本地记忆:auto / one_shot / per_shot
// - auto:智能 = 默认走逐镜拼接(避免后端策略漂移导致整片与分镜无关)
// - one_shot:一次推理直出多镜,仅 9 张分镜静帧作参考,≤15s
// - per_shot:每个分镜单独渲染,前端 ffmpeg 拼接,时长不限
export type RenderStrategy = 'auto' | 'one_shot' | 'per_shot';

const KEY = 'mv:render_strategy';
const DEFAULT: RenderStrategy = 'per_shot';

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

// 把"智能"解析为后端真正执行的策略(当前等同逐镜拼接)
export function resolveRenderStrategy(v: RenderStrategy): 'one_shot' | 'per_shot' {
  return v === 'one_shot' ? 'one_shot' : 'per_shot';
}

export const STRATEGY_LABEL: Record<RenderStrategy, string> = {
  auto: '智能',
  one_shot: '一次成片',
  per_shot: '逐镜拼接',
};

export const STRATEGY_HINT: Record<RenderStrategy, string> = {
  auto: '默认 · 等同逐镜拼接',
  one_shot: '一次出片 · ≤15s · 最自然',
  per_shot: '每镜单独渲染 · 时长不限',
};

// 视频分段规划:前后端共享逻辑(前端版,后端在 supabase/functions/_shared/marketing-segments.ts 有一份对应实现)。
// 用途:
//   1) 在 UI 上做"分段预览",所见即所得。
//   2) 后端 render-marketing-video 用相同规则切段并挑参考图。
// 备注:Seedance 2.0 全部走 reference_image,不再有"首帧/尾帧"概念;
//      ImageRole 仍保留 first/last 是为了兼容老数据,运行时统一当参考图处理。

export type ImageRole = 'first' | 'last' | 'reference';

export interface SceneImageRef {
  index: number;
  role: ImageRole;
}

export interface SceneLike {
  duration_s?: number;
  scene?: string;
  action?: string;
  dialogue?: string;
  subtitle?: string;
  image_index?: number | null;
  image_ref?: SceneImageRef | null;
}

export interface ScriptLike {
  hook?: SceneLike | null;
  outro?: SceneLike | null;
  scenes?: SceneLike[];
}

// 单段渲染上限必须与后端 render-marketing-video 的 MAX_SEG_DUR 完全一致
// (= Seedance 单段物理上限 15s)。改这里务必同步后端,否则 UI 分段预览会与实际渲染段数不一致。
import { SEEDANCE_MAX_SINGLE_SHOT } from './seedanceModels';
export const MAX_SEG_DUR = SEEDANCE_MAX_SINGLE_SHOT;

/** 读取一个镜头的有效图绑定,兼容老字段 image_index(默认作 first)。 */
export function effectiveImageRef(sc: SceneLike | null | undefined): SceneImageRef | null {
  if (!sc) return null;
  if (sc.image_ref && typeof sc.image_ref.index === 'number') {
    const role: ImageRole = sc.image_ref.role || 'first';
    return { index: sc.image_ref.index, role };
  }
  if (typeof sc.image_index === 'number' && sc.image_index >= 0) {
    return { index: sc.image_index, role: 'first' };
  }
  return null;
}

export interface SegmentPlan {
  index: number;
  total: number;
  durationS: number;
  sceneLabels: string[];     // ['钩子','镜头1','镜头2']
  firstIndex: number | null; // 本段首帧图在 image_urls 数组里的下标
  lastIndex: number | null;
  refIndices: number[];      // 本段额外参考图(去重)
}

/**
 * 根据总时长决定目标段数。
 * ≤15s 单段直出;16-30s 两段;31-45s 三段;更长按 ceil(total/15) 兜底。
 * 与后端 _shared/marketing-segments.ts 的 targetSegmentCount 保持同步。
 */
export function targetSegmentCount(totalDur: number): number {
  const t = Math.max(1, Math.round(totalDur || 0));
  if (t <= MAX_SEG_DUR) return 1;
  if (t <= 30) return 2;
  if (t <= 45) return 3;
  return Math.ceil(t / MAX_SEG_DUR);
}

/** 按目标段数等分时长(而非贪心装箱),让 30s 始终切成 2x15。与后端 splitScript 同步。 */
export function planSegments(script: ScriptLike | null | undefined): SegmentPlan[] {
  if (!script) return [];
  const hook = script.hook;
  const outro = script.outro;
  const mids = Array.isArray(script.scenes) ? script.scenes : [];

  const all: Array<{ sc: SceneLike; label: string; dur: number }> = [];
  if (hook) all.push({ sc: hook, label: '钩子', dur: Math.min(MAX_SEG_DUR, Number(hook.duration_s) || 2) });
  mids.forEach((m, i) =>
    all.push({ sc: m, label: `镜头${i + 1}`, dur: Math.min(MAX_SEG_DUR, Number(m.duration_s) || 2) }),
  );
  if (outro) all.push({ sc: outro, label: '收尾', dur: Math.min(MAX_SEG_DUR, Number(outro.duration_s) || 2) });
  if (!all.length) return [];

  const totalDur = all.reduce((s, x) => s + x.dur, 0);
  const target = targetSegmentCount(totalDur);
  const budget = totalDur / target;

  const buckets: Array<Array<{ sc: SceneLike; label: string; dur: number }>> = [];
  let cur: Array<{ sc: SceneLike; label: string; dur: number }> = [];
  let curDur = 0;
  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    const remainingItems = all.length - i;
    const remainingBuckets = target - buckets.length;
    const mustCloseForBudget =
      cur.length > 0 &&
      buckets.length < target - 1 &&
      curDur + item.dur > budget &&
      remainingItems >= remainingBuckets;
    const mustCloseForCap = cur.length > 0 && curDur + item.dur > MAX_SEG_DUR;
    if (mustCloseForBudget || mustCloseForCap) {
      buckets.push(cur);
      cur = [];
      curDur = 0;
    }
    cur.push(item);
    curDur += item.dur;
  }
  if (cur.length) buckets.push(cur);
  if (!buckets.length) return [];

  return buckets.map((bucket, i) => {
    const dur = bucket.reduce((s, x) => s + x.dur, 0);
    let firstIndex: number | null = null;
    let lastIndex: number | null = null;
    const refSet = new Set<number>();
    bucket.forEach((b) => {
      const ref = effectiveImageRef(b.sc);
      if (!ref) return;
      if (ref.role === 'first') {
        if (firstIndex === null) firstIndex = ref.index;
      } else if (ref.role === 'last') {
        lastIndex = ref.index;
      } else if (ref.role === 'reference') {
        refSet.add(ref.index);
      }
    });
    return {
      index: i,
      total: buckets.length,
      durationS: Math.min(MAX_SEG_DUR, Math.round(dur)),
      sceneLabels: bucket.map((b) => b.label),
      firstIndex,
      lastIndex,
      refIndices: Array.from(refSet),
    };
  });
}


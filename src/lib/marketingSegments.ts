// 视频分段规划:前后端共享逻辑(前端版,后端在 supabase/functions/_shared/marketing-segments.ts 有一份对应实现)。
// 用途:
//   1) 在 UI 上做"分段预览",所见即所得。
//   2) 后端 render-marketing-video 用相同规则切段并挑首帧/尾帧/参考图。

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

export const MAX_SEG_DUR = 10;

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

/** 按时长贪心装箱,每段 ≤ MAX_SEG_DUR 秒。与后端 splitScript 同步。 */
export function planSegments(script: ScriptLike | null | undefined): SegmentPlan[] {
  if (!script) return [];
  const hook = script.hook;
  const outro = script.outro;
  const mids = Array.isArray(script.scenes) ? script.scenes : [];

  const all: Array<{ sc: SceneLike; label: string }> = [];
  if (hook) all.push({ sc: hook, label: '钩子' });
  mids.forEach((m, i) => all.push({ sc: m, label: `镜头${i + 1}` }));
  if (outro) all.push({ sc: outro, label: '收尾' });

  const buckets: Array<Array<{ sc: SceneLike; label: string }>> = [];
  let cur: Array<{ sc: SceneLike; label: string }> = [];
  let curDur = 0;
  for (const item of all) {
    let d = Number(item.sc.duration_s) || 2;
    if (d > MAX_SEG_DUR) d = MAX_SEG_DUR;
    if (curDur + d > MAX_SEG_DUR && cur.length > 0) {
      buckets.push(cur);
      cur = [];
      curDur = 0;
    }
    cur.push(item);
    curDur += d;
  }
  if (cur.length) buckets.push(cur);
  if (!buckets.length) return [];

  return buckets.map((bucket, i) => {
    const dur = bucket.reduce((s, x) => s + (Number(x.sc.duration_s) || 2), 0);
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

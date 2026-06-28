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
  refIndices: number[];      // 本段所有参考图下标(去重),Seedance 2.0 全 reference 模式
}

/** 参考图模式真实可提交的时长网格。30s=10+10+10,45s=10+10+10+10+5,60s=10×6。 */
export function planR2vDurations(totalDur: number): number[] {
  let remaining = Math.max(5, Math.round(Number(totalDur) || 15));
  const out: number[] = [];
  while (remaining > 0) {
    if (remaining === 5) { out.push(5); break; }
    if (remaining < 10) { out.push(5); break; }
    out.push(10);
    remaining -= 10;
  }
  return out.slice(0, 8);
}

export function targetSegmentCount(totalDur: number): number {
  return planR2vDurations(totalDur).length;
}

/** 按 Seedance 2.0 参考图合法网格分段,与后端 splitScript 同步。 */
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

  const explicitTotal = Number((script as any).total_duration_s);
  const fallbackTotal = all.reduce((s, x) => s + x.dur, 0);
  const durations = planR2vDurations(explicitTotal || fallbackTotal || 15);
  const total = durations.length;

  return durations.map((durationS, i) => {
    const start = Math.floor(i * all.length / total);
    const end = Math.floor((i + 1) * all.length / total);
    const bucket = all.slice(start, Math.max(start + 1, end));
    const refSet = new Set<number>();
    bucket.forEach((b) => {
      const ref = effectiveImageRef(b.sc);
      if (!ref) return;
      // 2.0:不区分 role,所有绑定图统一进 refIndices
      refSet.add(ref.index);
    });
    return {
      index: i,
      total,
      durationS,
      sceneLabels: bucket.map((b) => b.label),
      refIndices: Array.from(refSet),
    };
  });
}


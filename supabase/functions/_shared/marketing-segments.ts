// Deno 端的视频分段规划。
// 与 src/lib/marketingSegments.ts 保持同步;改一处务必两边都改。

// Seedance 2.0 全部走 reference_image 通道。"first"/"last" 是 1.5 i2v 时代的字段,
// 仍保留在类型里只是为了兼容历史数据 / 老脚本字段,运行时一律按参考图处理。
export type ImageRole = "first" | "last" | "reference";

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
  // 其他字段透传
  [k: string]: unknown;
}

export interface ScriptLike {
  hook?: SceneLike | null;
  outro?: SceneLike | null;
  scenes?: SceneLike[];
  [k: string]: unknown;
}

// 与 Seedance 单段物理上限保持一致(15s)。改这里务必同步 _shared/seedance-models.ts。
export const MAX_SEG_DUR = 15;

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

export interface SegmentPlan {
  index: number;
  total: number;
  durationS: number;
  sceneLabels: string[];
  refIndices: number[];
}

export function planSegments(script: ScriptLike | null | undefined): SegmentPlan[] {
  if (!script) return [];
  const clips: Array<{ sc: SceneLike; label: string }> = [];
  if (script.hook) clips.push({ sc: script.hook, label: '钩子' });
  if (Array.isArray(script.scenes)) script.scenes.forEach((sc, i) => clips.push({ sc, label: `镜头${i + 1}` }));
  if (script.outro) clips.push({ sc: script.outro, label: '收尾' });
  if (!clips.length) return [];

  const explicitTotal = Number((script as any).total_duration_s);
  const fallbackTotal = clips.reduce((s, x) => s + (Number(x.sc.duration_s) || 3), 0);
  const durations = planR2vDurations(explicitTotal || fallbackTotal || 15);
  const total = durations.length;

  return durations.map((durationS, i) => {
    const start = Math.floor(i * clips.length / total);
    const end = Math.floor((i + 1) * clips.length / total);
    const group = clips.slice(start, Math.max(start + 1, end));
    const refSet = new Set<number>();
    group.forEach((g) => {
      const ref = effectiveImageRef(g.sc);
      if (ref) refSet.add(ref.index);
    });
    return {
      index: i,
      total,
      durationS,
      sceneLabels: group.map((g) => g.label),
      refIndices: Array.from(refSet),
    };
  });
}

export function effectiveImageRef(sc: SceneLike | null | undefined): SceneImageRef | null {
  if (!sc) return null;
  if (sc.image_ref && typeof sc.image_ref.index === "number") {
    const role: ImageRole = (sc.image_ref.role as ImageRole) || "first";
    return { index: sc.image_ref.index, role };
  }
  if (typeof sc.image_index === "number" && sc.image_index >= 0) {
    return { index: sc.image_index, role: "first" };
  }
  return null;
}

/** 从一个(已经被 splitScript 拆出的)子脚本里挑参考图下标(2.0 全 reference 模式)。 */
export function pickSegmentImages(sub: ScriptLike): {
  refIndices: number[];
} {
  const seq: SceneLike[] = [];
  if (sub.hook) seq.push(sub.hook);
  if (Array.isArray(sub.scenes)) seq.push(...sub.scenes);
  if (sub.outro) seq.push(sub.outro);

  const refSet = new Set<number>();
  for (const sc of seq) {
    const ref = effectiveImageRef(sc);
    if (!ref) continue;
    // 2.0:不管原始 role 是 first/last/reference,统统当参考图收集
    refSet.add(ref.index);
  }
  return { refIndices: Array.from(refSet) };
}

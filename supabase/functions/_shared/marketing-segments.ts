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

/**
 * 根据总时长决定目标段数,与 src/lib/marketingSegments.ts 完全一致。
 * ≤15s 单段直出;16-30s 两段;31-45s 三段;更长按 ceil(total/15) 兜底。
 */
export function targetSegmentCount(totalDur: number): number {
  const t = Math.max(1, Math.round(totalDur || 0));
  if (t <= MAX_SEG_DUR) return 1;
  if (t <= 30) return 2;
  if (t <= 45) return 3;
  return Math.ceil(t / MAX_SEG_DUR);
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

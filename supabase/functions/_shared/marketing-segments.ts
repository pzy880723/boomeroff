// Deno 端的视频分段规划。
// 与 src/lib/marketingSegments.ts 保持同步;改一处务必两边都改。

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

export const MAX_SEG_DUR = 10;

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

/** 从一个(已经被 splitScript 拆出的)子脚本里挑首帧/尾帧/参考图下标。 */
export function pickSegmentImages(sub: ScriptLike): {
  firstIndex: number | null;
  lastIndex: number | null;
  refIndices: number[];
} {
  const seq: SceneLike[] = [];
  if (sub.hook) seq.push(sub.hook);
  if (Array.isArray(sub.scenes)) seq.push(...sub.scenes);
  if (sub.outro) seq.push(sub.outro);

  let firstIndex: number | null = null;
  let lastIndex: number | null = null;
  const refSet = new Set<number>();
  for (const sc of seq) {
    const ref = effectiveImageRef(sc);
    if (!ref) continue;
    if (ref.role === "first") {
      if (firstIndex === null) firstIndex = ref.index;
    } else if (ref.role === "last") {
      lastIndex = ref.index;
    } else if (ref.role === "reference") {
      refSet.add(ref.index);
    }
  }
  return { firstIndex, lastIndex, refIndices: Array.from(refSet) };
}

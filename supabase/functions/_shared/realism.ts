// 分镜 / 渲染的画风开关。
// stylized = 现有插画风(默认,过审稳),photoreal = 真人写实纪实摄影。
export type Realism = "stylized" | "photoreal";
export const DEFAULT_REALISM: Realism = "stylized";

export function normalizeRealism(v: unknown): Realism {
  return v === "photoreal" ? "photoreal" : "stylized";
}

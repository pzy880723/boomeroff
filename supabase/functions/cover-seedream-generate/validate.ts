// cover-seedream-generate 的纯校验/构造逻辑,便于直接单元测试。
// 严禁在此记录 prompt、图片内容或任何密钥。

export const ARK_IMAGE_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";
export const ARK_MODEL = "doubao-seedream-5-0-lite-260128";

export const MAX_PROMPT_LENGTH = 4000;
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 单张 8MB
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024; // 总计 24MB

const DATA_IMAGE_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=\s]+$/;

export type ValidationError = { error: string };
export type ValidatedInput = { prompt: string; image: string[]; size: string };

export function validateRequest(body: unknown): ValidatedInput | ValidationError {
  const b = (body ?? {}) as Record<string, unknown>;

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return { error: "prompt 必填" };
  if (prompt.length > MAX_PROMPT_LENGTH) return { error: `prompt 超长(最多 ${MAX_PROMPT_LENGTH} 字符)` };

  const image = b.image;
  if (!Array.isArray(image) || image.length < 1 || image.length > MAX_IMAGES) {
    return { error: `image 必须为 1-${MAX_IMAGES} 张参考图` };
  }

  let total = 0;
  for (const item of image) {
    if (typeof item !== "string" || !DATA_IMAGE_RE.test(item)) {
      return { error: "image 只允许 data:image/jpeg;base64 或 data:image/png;base64" };
    }
    const bytes = base64ByteLength(item);
    if (bytes > MAX_IMAGE_BYTES) return { error: "单张参考图过大" };
    total += bytes;
    if (total > MAX_TOTAL_BYTES) return { error: "参考图总大小超限" };
  }

  const size = b.size === undefined || b.size === null || b.size === "" ? "2K" : b.size;
  if (typeof size !== "string" || size !== "2K") return { error: "size 仅支持 2K" };

  return { prompt, image: image as string[], size };
}

export function base64ByteLength(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  const raw = (idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl).replace(/\s/g, "");
  const padding = raw.endsWith("==") ? 2 : raw.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((raw.length * 3) / 4) - padding);
}

export function buildArkBody(input: ValidatedInput): Record<string, unknown> {
  return {
    model: ARK_MODEL,
    prompt: input.prompt,
    image: input.image,
    size: input.size,
    response_format: "b64_json",
    watermark: false,
  };
}

/** 上游错误只返回安全摘要:不含密钥、图片、prompt。 */
export function sanitizeUpstreamError(status: number, rawText: string): { error: string; upstream_status: number; upstream_code?: string } {
  let code: string | undefined;
  try {
    const parsed = JSON.parse(rawText);
    const err = parsed?.error ?? parsed;
    if (typeof err?.code === "string") code = err.code;
    else if (typeof err?.type === "string") code = err.type;
  } catch {
    // 忽略非 JSON 上游响应
  }
  return {
    error: "上游图片生成失败",
    upstream_status: status,
    ...(code ? { upstream_code: code.slice(0, 120) } : {}),
  };
}

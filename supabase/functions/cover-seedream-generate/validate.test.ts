// cover-seedream-generate 直接测试:鉴权、图片数量/格式校验、固定模型与参数、上游错误脱敏。
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCoverWorkerToken } from "../_shared/cover-generation.ts";
import {
  ARK_MODEL,
  base64ByteLength,
  buildArkBody,
  MAX_PROMPT_LENGTH,
  sanitizeUpstreamError,
  validateRequest,
} from "./validate.ts";

const img = (kind: "jpeg" | "png" = "jpeg") => `data:image/${kind};base64,AAAABBBBCCCC==`;

Deno.test("鉴权:token 优先级与 fallback,都缺失为 null", () => {
  const mk = (m: Record<string, string>) => (k: string) => m[k];
  assertEquals(resolveCoverWorkerToken(mk({ COVER_WORKER_TOKEN: "a", WORKER_SHARED_SECRET: "b" })), "a");
  assertEquals(resolveCoverWorkerToken(mk({ WORKER_SHARED_SECRET: "b" })), "b");
  assertEquals(resolveCoverWorkerToken(mk({})), null);
});

Deno.test("prompt 必填且限制长度", () => {
  assertEquals((validateRequest({ image: [img()] }) as { error: string }).error, "prompt 必填");
  const long = { prompt: "ا".repeat(MAX_PROMPT_LENGTH + 1), image: [img()] };
  assert((validateRequest(long) as { error: string }).error.includes("超长"));
});

Deno.test("image 必须 1-4 张", () => {
  assert((validateRequest({ prompt: "p", image: [] }) as { error: string }).error.includes("1-4"));
  assert((validateRequest({ prompt: "p", image: Array(5).fill(img()) }) as { error: string }).error.includes("1-4"));
  assert(!("error" in validateRequest({ prompt: "p", image: [img()] })));
  assert(!("error" in validateRequest({ prompt: "p", image: Array(4).fill(img("png")) })));
});

Deno.test("非 data image 一律拒绝", () => {
  for (const bad of ["https://cdn/x.jpg", "data:image/webp;base64,AAAA", "data:text/plain;base64,AAAA", 123]) {
    const r = validateRequest({ prompt: "p", image: [bad] }) as { error: string };
    assert(r.error.includes("data:image"), `should reject ${String(bad)}`);
  }
});

Deno.test("单张与总大小超限返回错误", () => {
  const big = "data:image/png;base64," + "A".repeat(12 * 1024 * 1024);
  assertEquals((validateRequest({ prompt: "p", image: [big] }) as { error: string }).error, "单张参考图过大");
  const mid = "data:image/png;base64," + "A".repeat(7 * 1024 * 1024);
  assertEquals(
    (validateRequest({ prompt: "p", image: [mid, mid, mid, mid] }) as { error: string }).error,
    "参考图总大小超限",
  );
  assert(base64ByteLength("data:image/png;base64,AAAA") === 3);
});

Deno.test("固定模型 / size 默认 2K / b64_json / 无水印", () => {
  const v = validateRequest({ prompt: " 封面 ", image: [img()] });
  assert(!("error" in v));
  const body = buildArkBody(v as never);
  assertEquals(body.model, ARK_MODEL);
  assertEquals(body.prompt, "封面");
  assertEquals(body.size, "2K");
  assertEquals(body.response_format, "b64_json");
  assertEquals(body.watermark, false);
  assertEquals((body.image as string[]).length, 1);
  assert((validateRequest({ prompt: "p", image: [img()], size: "4K" }) as { error: string }).error.includes("2K"));
});

Deno.test("上游错误脱敏:不泄露密钥/图片/prompt", () => {
  const raw = JSON.stringify({
    error: { code: "InvalidParameter", message: "Bearer sk-secret-123 rejected for prompt 门店封面" },
  });
  const safe = sanitizeUpstreamError(429, raw);
  assertEquals(safe.error, "上游图片生成失败");
  assertEquals(safe.upstream_status, 429);
  assertEquals(safe.upstream_code, "InvalidParameter");
  const s = JSON.stringify(safe);
  assert(!s.includes("sk-secret-123"));
  assert(!s.includes("门店封面"));

  const nonJson = sanitizeUpstreamError(500, "<html>sk-leak</html>");
  assert(!JSON.stringify(nonJson).includes("sk-leak"));
  assertEquals(nonJson.upstream_code, undefined);
});

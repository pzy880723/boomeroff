// cover-seedream-generate: 内部 Seedream 代理,避免腾讯云 Worker 复制 ARK_API_KEY。
// 鉴权复用封面 Worker token(COVER_WORKER_TOKEN > WORKER_SHARED_SECRET > COMPOSE_WORKER_TOKEN)。
// 关键:Seedream 5.0 lite 不支持 stream,使用非流式 JSON 请求;上游成功后仍原样透传 body。
// 不记录 prompt、图片内容或任何密钥。
import { resolveCoverWorkerToken } from "../_shared/cover-generation.ts";
import {
  ARK_IMAGE_ENDPOINT,
  buildArkBody,
  mapCaughtError,
  passthroughHeaders,
  readLimitedText,
  sanitizeUpstreamError,
  validateRequest,
} from "./validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const TOKEN = resolveCoverWorkerToken();
    if (!TOKEN) return json({ error: "封面 Worker Token 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ error: "未授权" }, 401);

    const ARK_API_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_API_KEY) return json({ error: "ARK_API_KEY 未配置" }, 500);

    const body = await req.json().catch(() => ({}));
    const validated = validateRequest(body);
    if ("error" in validated) return json({ error: validated.error }, 400);

    const resp = await fetch(ARK_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify(buildArkBody(validated)),
    });

    if (!resp.ok) {
      const text = await readLimitedText(resp.body);
      const safe = sanitizeUpstreamError(resp.status, text);
      console.error("[cover-seedream-generate] upstream failed", safe.upstream_status, safe.upstream_code ?? "");
      return json(safe, 502);
    }

    // 上游非流式 JSON:不解析、不重建,原样透传 body
    return new Response(resp.body, {
      status: 200,
      headers: passthroughHeaders(resp.headers.get("content-type"), corsHeaders),
    });
  } catch (e) {
    const mapped = mapCaughtError(e);
    console.error("[cover-seedream-generate] error", (e as Error)?.name || "unknown", mapped.status);
    return json(mapped.body, mapped.status);
  }
});

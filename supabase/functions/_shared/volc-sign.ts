// 火山引擎 OpenAPI V4 签名（用于 ark Asset/Visual 等 AK/SK 接口）
// 参考: https://www.volcengine.com/docs/6369/67269

const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", k, enc.encode(data));
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(data));
  return toHex(buf);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface VolcCallOptions {
  action: string;
  version?: string;            // 默认 2024-01-01
  service?: string;            // 默认 ark
  region?: string;             // 默认 cn-beijing
  host?: string;               // 默认 open.volcengineapi.com
  body: Record<string, unknown>;
}

export interface VolcCallResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  raw?: any;
}

/** 调用火山 OpenAPI（POST + JSON body + query 带 Action/Version） */
export async function volcCall<T = any>(opts: VolcCallOptions): Promise<VolcCallResult<T>> {
  const ak = Deno.env.get("VOLC_ACCESS_KEY_ID");
  const sk = Deno.env.get("VOLC_SECRET_ACCESS_KEY");
  if (!ak || !sk) return { ok: false, status: 0, error: "未配置 VOLC_ACCESS_KEY_ID/VOLC_SECRET_ACCESS_KEY" };

  const service = opts.service || "ark";
  const region = opts.region || "cn-beijing";
  const version = opts.version || "2024-01-01";
  const host = opts.host || "open.volcengineapi.com";

  const body = JSON.stringify(opts.body || {});
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const shortDate = xDate.slice(0, 8);

  const payloadHash = await sha256Hex(body);

  const query = `Action=${encodeURIComponent(opts.action)}&Version=${encodeURIComponent(version)}`;
  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${host}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";

  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmac(enc.encode(sk), shortDate);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization =
    `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}/?${query}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": host,
      "X-Date": xDate,
      "X-Content-Sha256": payloadHash,
      "Authorization": authorization,
    },
    body,
  });

  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  // 火山 OpenAPI 响应体形如 { ResponseMetadata, Result }
  if (!res.ok) {
    const errMsg = parsed?.ResponseMetadata?.Error?.Message
      || parsed?.ResponseMetadata?.Error?.CodeN
      || parsed?.message
      || `HTTP ${res.status}`;
    return { ok: false, status: res.status, error: String(errMsg), raw: parsed };
  }
  if (parsed?.ResponseMetadata?.Error) {
    const e = parsed.ResponseMetadata.Error;
    return { ok: false, status: res.status, error: e.Message || e.Code || "OpenAPI 错误", raw: parsed };
  }
  return { ok: true, status: res.status, data: (parsed?.Result ?? parsed) as T, raw: parsed };
}

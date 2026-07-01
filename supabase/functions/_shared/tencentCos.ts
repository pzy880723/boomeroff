// Tencent COS v5 signing + minimal PUT/HEAD client for Deno.
// Reference: https://cloud.tencent.com/document/product/436/7778

const enc = new TextEncoder();

async function hmacSha1Hex(key: string | Uint8Array, msg: string): Promise<string> {
  const keyBuf = typeof key === "string" ? enc.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha1Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", enc.encode(msg));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CosConfig {
  secretId: string;
  secretKey: string;
  bucket: string; // e.g. lovable-backup-1257117127
  region: string; // e.g. ap-shanghai
}

export function readCosConfigFromEnv(): CosConfig {
  const cfg: CosConfig = {
    secretId: Deno.env.get("TENCENT_COS_SECRET_ID") ?? "",
    secretKey: Deno.env.get("TENCENT_COS_SECRET_KEY") ?? "",
    bucket: Deno.env.get("TENCENT_COS_BUCKET") ?? "",
    region: Deno.env.get("TENCENT_COS_REGION") ?? "",
  };
  if (!cfg.secretId || !cfg.secretKey || !cfg.bucket || !cfg.region) {
    throw new Error("腾讯云 COS 配置缺失（请检查 TENCENT_COS_* 环境变量）");
  }
  return cfg;
}

export function cosHost(cfg: CosConfig): string {
  return `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
}

/** Build a Tencent COS Authorization header. */
export async function signCos(opts: {
  cfg: CosConfig;
  method: string; // GET / PUT ...
  pathname: string; // URL path, must start with '/'
  expireSeconds?: number;
}): Promise<string> {
  const { cfg, method, pathname } = opts;
  const expire = opts.expireSeconds ?? 600;
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now};${now + expire}`;

  const signKey = await hmacSha1Hex(cfg.secretKey, keyTime);
  const httpString = `${method.toLowerCase()}\n${pathname}\n\n\n`;
  const stringToSign = `sha1\n${keyTime}\n${await sha1Hex(httpString)}\n`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(signKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(stringToSign));
  const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${cfg.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
}

/** PUT a blob/buffer to COS. Returns ETag on success. Retries on 5xx / network errors. */
export async function cosPutObject(opts: {
  cfg: CosConfig;
  key: string; // object key WITHOUT leading slash
  body: Uint8Array | Blob;
  contentType?: string;
  maxAttempts?: number;
  perAttemptTimeoutMs?: number;
}): Promise<{ etag: string; size: number }> {
  const { cfg, key, body } = opts;
  const pathname = `/${encodeURI(key).replace(/%2F/g, "/")}`;
  const url = `https://${cosHost(cfg)}${pathname}`;
  const payload = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : body;
  const maxAttempts = opts.maxAttempts ?? 4;
  // Scale timeout with payload size. Callers may pass a tighter budget when
  // running inside a short Edge Function tick; default remains conservative.
  const derived = 8_000 + Math.round(payload.byteLength / (500 * 1024)) * 1000;
  const perAttemptTimeoutMs = opts.perAttemptTimeoutMs ?? Math.min(90_000, Math.max(10_000, derived));

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const auth = await signCos({ cfg, method: "PUT", pathname });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
    try {
      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": opts.contentType ?? "application/octet-stream",
          "Content-Length": String(payload.byteLength),
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        return { etag: resp.headers.get("etag") ?? "", size: payload.byteLength };
      }
      const text = await resp.text().catch(() => "");
      // 4xx (except 408/429) are permanent — don't retry.
      if (resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
        throw new Error(`COS PUT 失败 (${resp.status}): ${text.slice(0, 200)}`);
      }
      lastErr = new Error(`COS PUT ${resp.status}: ${text.slice(0, 120)}`);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e instanceof DOMException && e.name === "AbortError"
        ? new Error(`本次上传等待超过 ${Math.round(perAttemptTimeoutMs / 1000)} 秒`)
        : e;
      const msg = e instanceof Error ? e.message : String(e);
      // Permanent error already surfaced above — rethrow.
      if (msg.startsWith("COS PUT 失败 (4")) throw e;
    }
    if (attempt < maxAttempts) {
      // Exponential backoff: 500ms, 1500ms, 4500ms.
      await new Promise((r) => setTimeout(r, 500 * Math.pow(3, attempt - 1)));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown");
  throw new Error(`COS PUT 反复失败 (${maxAttempts} 次): ${msg}`);
}

/** HEAD object — returns ETag/size if exists, null if 404. */
export async function cosHeadObject(opts: {
  cfg: CosConfig;
  key: string;
  timeoutMs?: number;
}): Promise<{ etag: string; size: number } | null> {
  const { cfg, key } = opts;
  const pathname = `/${encodeURI(key).replace(/%2F/g, "/")}`;
  const auth = await signCos({ cfg, method: "HEAD", pathname });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);
  let resp: Response;
  try {
    resp = await fetch(`https://${cosHost(cfg)}${pathname}`, {
      method: "HEAD",
      headers: { Authorization: auth },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`COS HEAD 失败 (${resp.status})`);
  return {
    etag: (resp.headers.get("etag") ?? "").replaceAll('"', ""),
    size: Number(resp.headers.get("content-length") ?? "0"),
  };
}

/** gzip a Uint8Array via the platform CompressionStream. */
export async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const stream = new Blob([input as unknown as BlobPart]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

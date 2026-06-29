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

/** PUT a blob/buffer to COS. Returns ETag on success. */
export async function cosPutObject(opts: {
  cfg: CosConfig;
  key: string; // object key WITHOUT leading slash
  body: Uint8Array | Blob;
  contentType?: string;
}): Promise<{ etag: string; size: number }> {
  const { cfg, key, body } = opts;
  const pathname = `/${encodeURI(key).replace(/%2F/g, "/")}`;
  const auth = await signCos({ cfg, method: "PUT", pathname });
  const url = `https://${cosHost(cfg)}${pathname}`;
  const payload = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : body;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": opts.contentType ?? "application/octet-stream",
      "Content-Length": String(payload.byteLength),
    },
    body: payload,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`COS PUT 失败 (${resp.status}): ${text.slice(0, 200)}`);
  }
  return { etag: resp.headers.get("etag") ?? "", size: payload.byteLength };
}

/** HEAD object — returns ETag/size if exists, null if 404. */
export async function cosHeadObject(opts: {
  cfg: CosConfig;
  key: string;
}): Promise<{ etag: string; size: number } | null> {
  const { cfg, key } = opts;
  const pathname = `/${encodeURI(key).replace(/%2F/g, "/")}`;
  const auth = await signCos({ cfg, method: "HEAD", pathname });
  const resp = await fetch(`https://${cosHost(cfg)}${pathname}`, {
    method: "HEAD",
    headers: { Authorization: auth },
  });
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

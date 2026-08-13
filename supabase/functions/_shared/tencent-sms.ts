const DEFAULT_TENCENT_SMS_SIGN_NAME_B64 = '5a6d5pqu5LiK5rW35ZOB54mM566h55CG';

export type TencentSmsMode = 'otp' | 'notify' | 'link';

export async function sendTencentSms(
  phone: string,
  mode: TencentSmsMode,
  templateParams: string[],
) {
  const secretId = Deno.env.get('TENCENT_SMS_SECRET_ID');
  const secretKey = Deno.env.get('TENCENT_SMS_SECRET_KEY');
  if (!secretId || !secretKey) {
    return { ok: false, error: 'sms_not_configured', message: '短信服务未配置，请联系管理员' };
  }

  const sdkAppId = Deno.env.get('TENCENT_SMS_SDK_APP_ID');
  const sign = getTencentSignName();
  const signName = sign.value;
  const templateId =
    mode === 'otp' ? Deno.env.get('TENCENT_SMS_OTP_TEMPLATE_ID')
    : mode === 'notify' ? Deno.env.get('TENCENT_SMS_NOTIFY_TEMPLATE_ID')
    : Deno.env.get('TENCENT_SMS_TEMPLATE_ID');
  if (!sdkAppId || !signName || !templateId) {
    return { ok: false, error: `Tencent SMS config missing (${mode})`, diagnostic: sign.diagnostic };
  }

  const host = 'sms.tencentcloudapi.com';
  const service = 'sms';
  const region = 'ap-guangzhou';
  const action = 'SendSms';
  const version = '2021-01-11';
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [phone.startsWith('+') ? phone : `+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: templateParams,
  });

  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256Hex(payload)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign =
    `TC3-HMAC-SHA256\n${ts}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const kDate = await hmacSha256(new TextEncoder().encode(`TC3${secretKey}`), date);
  const kService = await hmacSha256(new Uint8Array(kDate), service);
  const kSigning = await hmacSha256(new Uint8Array(kService), 'tc3_request');
  const sigBuf = await hmacSha256(new Uint8Array(kSigning), stringToSign);
  const signature = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(ts),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payload,
  });
  const result = await response.json().catch(() => null);
  const status = result?.Response?.SendStatusSet?.[0];
  if (status?.Code === 'Ok') return { ok: true, diagnostic: sign.diagnostic };

  const code = status?.Code || result?.Response?.Error?.Code || 'UnknownError';
  const message = status?.Message || result?.Response?.Error?.Message || JSON.stringify(result);
  console.error('[tencent-sms] failed', { code, message, diagnostic: sign.diagnostic });
  return { ok: false, error: `Tencent: ${code} ${message}`, diagnostic: sign.diagnostic };
}

function getTencentSignName() {
  const b64 = Deno.env.get('TENCENT_SMS_SIGN_NAME_B64')?.trim();
  const raw = Deno.env.get('TENCENT_SMS_SIGN_NAME')?.trim() || '';
  let value = raw;
  let source: 'base64' | 'raw' | 'safe_default' = 'raw';
  let decodeError: string | null = null;

  if (b64) {
    const decoded = decodeSignBase64(b64);
    if (decoded.ok) {
      value = decoded.value;
      source = 'base64';
    } else {
      decodeError = decoded.error;
      console.error('[tencent-sms] sign base64 decode failed', { error: decoded.error });
    }
  }
  if (!value || value.includes('�')) {
    const decoded = decodeSignBase64(DEFAULT_TENCENT_SMS_SIGN_NAME_B64);
    if (decoded.ok) {
      value = decoded.value;
      source = 'safe_default';
    }
  }

  return {
    value,
    diagnostic: {
      sign_name: value || null,
      sign_source: source,
      sign_length: [...value].length,
      sign_contains_replacement: value.includes('�'),
      sign_decode_error: decodeError,
      sign_codepoints: [...value].map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`),
      sign_b64_configured: Boolean(b64),
    },
  };
}

function decodeSignBase64(input: string): { ok: true; value: string } | { ok: false; error: string } {
  const unquoted = input.trim().replace(/^['"]|['"]$/g, '');
  const normalized = unquoted.replace(/-/g, '+').replace(/_/g, '/');
  const compact = normalized.replace(/[^A-Za-z0-9+/=]/g, '');
  const candidates = [...new Set([unquoted, normalized, compact])].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const value = new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(candidate));
      if (value && !value.includes('�')) return { ok: true, value };
    } catch {
      // Try the next normalization form.
    }
  }
  return { ok: false, error: '编码签名不是有效的 Base64 内容' };
}

function base64ToBytes(input: string) {
  const bin = atob(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

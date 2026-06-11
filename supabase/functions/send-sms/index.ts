// 短信发送：阿里云/腾讯云（自动按已配置的 secret 选择）
// 两种调用方式：
//   1) OTP 验证码：{ phone, template: 'otp', params: { code } }
//      腾讯云模板示例：您的验证码为{1}，5分钟内有效，请勿泄露。
//   2) 活动链接（legacy）：{ phone, activity_name, claim_share_token }
//      腾讯云模板示例：{1}活动邀请，点击 {2} 领取。
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { phone, template, params, activity_name, claim_share_token } = body || {};
    if (!phone) return json({ error: 'missing phone' }, 400);
    if (!/^1[3-9]\d{9}$/.test(String(phone))) return json({ error: '手机号格式不正确' }, 400);

    // 构造模板参数数组（决定调用哪种模板）
    let mode: 'otp' | 'link';
    let templateParams: string[];
    let link = '';
    if (template === 'otp') {
      const code = params?.code ? String(params.code) : '';
      if (!/^\d{4,8}$/.test(code)) return json({ error: 'invalid otp code' }, 400);
      mode = 'otp';
      templateParams = [code];
    } else {
      if (!claim_share_token) return json({ error: 'missing claim_share_token' }, 400);
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: settings } = await supabase
        .from('app_settings').select('value').eq('key', 'public_site_url').maybeSingle();
      const baseUrl = (settings?.value as any)?.url || 'https://boomeroff.lovable.app';
      link = `${baseUrl}/u/claim/${claim_share_token}`;
      mode = 'link';
      templateParams = [truncate(activity_name, 20), link];
    }

    // 仅支持腾讯云（按用户决定）
    const tcId = Deno.env.get('TENCENT_SMS_SECRET_ID');
    const tcKey = Deno.env.get('TENCENT_SMS_SECRET_KEY');
    if (!tcId || !tcKey) {
      return json({ error: 'sms_not_configured', message: '短信服务未配置，请联系店员手动核销' }, 503);
    }

    const r = await sendTencent(phone, mode, templateParams, tcId, tcKey);
    return json(r, r.ok ? 200 : 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function sendTencent(
  phone: string,
  mode: 'otp' | 'link',
  templateParams: string[],
  secretId: string,
  secretKey: string,
) {
  const sdkAppId = Deno.env.get('TENCENT_SMS_SDK_APP_ID');
  const signName = Deno.env.get('TENCENT_SMS_SIGN_NAME');
  const templateId = mode === 'otp'
    ? Deno.env.get('TENCENT_SMS_OTP_TEMPLATE_ID')
    : Deno.env.get('TENCENT_SMS_TEMPLATE_ID');
  if (!sdkAppId || !signName || !templateId) {
    return { ok: false, error: `Tencent SMS config missing (${mode})` };
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

  const hashed = await sha256Hex(payload);
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashed}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign =
    `TC3-HMAC-SHA256\n${ts}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const kDate = await hmacSha256(new TextEncoder().encode('TC3' + secretKey), date);
  const kService = await hmacSha256(new Uint8Array(kDate), service);
  const kSigning = await hmacSha256(new Uint8Array(kService), 'tc3_request');
  const sigBuf = await hmacSha256(new Uint8Array(kSigning), stringToSign);
  const signature = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

  const auth =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const resp = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json; charset=utf-8',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(ts),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payload,
  });
  const r = await resp.json().catch(() => null);
  const status = r?.Response?.SendStatusSet?.[0];
  if (status?.Code === 'Ok') return { ok: true };
  const code = status?.Code || r?.Response?.Error?.Code || 'UnknownError';
  const message = status?.Message || r?.Response?.Error?.Message || JSON.stringify(r);
  console.error('[tencent-sms] failed', { code, message });
  return { ok: false, error: `Tencent: ${code} ${message}` };
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hmacSha256(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
}
function truncate(s: string | undefined, n: number) {
  return (s || '').slice(0, n);
}
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

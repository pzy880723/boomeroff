// 短信发送：阿里云/腾讯云（自动按已配置的 secret 选择）
// 模板变量：{1} 活动名（最多20字），{2} 短链 token
// 未配置任何短信凭证时返回错误，由调用方记录 sms_error
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone, activity_name, claim_share_token } = await req.json().catch(() => ({}));
    if (!phone || !claim_share_token) return json({ error: 'missing params' }, 400);

    // 取站点域名（用于短链）
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: settings } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'public_site_url')
      .maybeSingle();
    const baseUrl = (settings?.value as any)?.url || 'https://boomeroff.lovable.app';
    const link = `${baseUrl}/u/claim/${claim_share_token}`;

    // 优先阿里云
    const aliKey = Deno.env.get('ALIYUN_SMS_ACCESS_KEY_ID');
    const aliSecret = Deno.env.get('ALIYUN_SMS_ACCESS_KEY_SECRET');
    if (aliKey && aliSecret) {
      const r = await sendAliyun(phone, activity_name, link, aliKey, aliSecret);
      return json(r, r.ok ? 200 : 400);
    }

    const tcId = Deno.env.get('TENCENT_SMS_SECRET_ID');
    const tcKey = Deno.env.get('TENCENT_SMS_SECRET_KEY');
    if (tcId && tcKey) {
      const r = await sendTencent(phone, activity_name, link, tcId, tcKey);
      return json(r, r.ok ? 200 : 400);
    }

    return json({ error: 'SMS provider not configured' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function sendAliyun(phone: string, activity: string, link: string, key: string, secret: string) {
  const signName = Deno.env.get('ALIYUN_SMS_SIGN_NAME');
  const templateCode = Deno.env.get('ALIYUN_SMS_TEMPLATE_CODE');
  if (!signName || !templateCode) return { ok: false, error: 'Aliyun SMS SIGN_NAME/TEMPLATE_CODE missing' };

  // Aliyun SMS API：RPC 风格签名（POP）
  const params: Record<string, string> = {
    AccessKeyId: key,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    RegionId: 'cn-hangzhou',
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ name: truncate(activity, 20), link }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, ''),
    Version: '2017-05-25',
  };

  const sorted = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(sorted)}`;
  const signKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret + '&'),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', signKey, new TextEncoder().encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const formBody = new URLSearchParams({ ...params, Signature: signature }).toString();
  const resp = await fetch('https://dysmsapi.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody,
  });
  const result = await resp.json();
  if (result.Code === 'OK') return { ok: true };
  return { ok: false, error: `Aliyun: ${result.Code} ${result.Message}` };
}

async function sendTencent(phone: string, activity: string, link: string, secretId: string, secretKey: string) {
  const sdkAppId = Deno.env.get('TENCENT_SMS_SDK_APP_ID');
  const signName = Deno.env.get('TENCENT_SMS_SIGN_NAME');
  const templateId = Deno.env.get('TENCENT_SMS_TEMPLATE_ID');
  if (!sdkAppId || !signName || !templateId) return { ok: false, error: 'Tencent SMS config missing' };

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
    TemplateParamSet: [truncate(activity, 20), link],
  });

  const hashed = await sha256Hex(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashed}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${ts}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const kDate = await hmacSha256(new TextEncoder().encode('TC3' + secretKey), date);
  const kService = await hmacSha256(kDate, service);
  const kSigning = await hmacSha256(kService, 'tc3_request');
  const sigBuf = await hmacSha256(kSigning, stringToSign);
  const signature = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

  const auth = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
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
  const r = await resp.json();
  const status = r?.Response?.SendStatusSet?.[0];
  if (status?.Code === 'Ok') return { ok: true };
  return { ok: false, error: `Tencent: ${status?.Code || r?.Response?.Error?.Code} ${status?.Message || r?.Response?.Error?.Message}` };
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

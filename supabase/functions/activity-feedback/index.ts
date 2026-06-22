// 公开：活动参与者自助反馈（已领券者再次扫码后使用）
// actions: get | lookup_by_phone | upload | submit
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

// 通过 share_token 找 activity
async function findActivity(sb: ReturnType<typeof admin>, share_token: string) {
  const { data } = await sb
    .from('activities')
    .select('id, voucher_id, voucher:vouchers(name, threshold_type, discount_amount, min_spend, valid_days)')
    .eq('share_token', share_token)
    .maybeSingle();
  return data;
}

// 校验 short_code 属于该 activity 并返回 application + claim
async function loadByShortCode(sb: ReturnType<typeof admin>, activityId: string, short_code: string) {
  const { data: claim } = await sb
    .from('voucher_claims')
    .select('id, short_code, status, expires_at, redeemed_at, claimed_at')
    .eq('short_code', short_code)
    .maybeSingle();
  if (!claim) return { error: '优惠券不存在' as const };
  const { data: app } = await sb
    .from('activity_applications')
    .select('id, applicant_name, applicant_phone, publish_screenshots, publish_url, publish_confirm_note, publish_confirmed, publish_confirmed_at')
    .eq('activity_id', activityId)
    .eq('voucher_claim_id', claim.id)
    .maybeSingle();
  if (!app) return { error: '该优惠券不属于此活动' as const };
  return { claim, app };
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

const extFromContentType = (ct: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  };
  return map[ct.toLowerCase()] || 'bin';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    const share_token = String(body?.share_token || '').trim();
    if (!share_token) return json({ error: 'share_token required' }, 400);

    const sb = admin();
    const activity = await findActivity(sb, share_token);
    if (!activity) return json({ error: '活动不存在' }, 404);

    if (action === 'lookup_by_phone') {
      const phone = String(body?.phone || '').trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) return json({ error: '手机号格式不正确' }, 400);
      const { data: apps } = await sb
        .from('activity_applications')
        .select('id, voucher_claim_id, voucher_claim:voucher_claims(short_code)')
        .eq('activity_id', activity.id)
        .eq('applicant_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1);
      const app = (apps || [])[0] as any;
      if (!app) return json({ found: false });
      const short_code = app?.voucher_claim?.short_code as string | undefined;
      if (!short_code) return json({ found: true, pending: true });
      return json({ found: true, short_code });
    }


    const short_code = String(body?.short_code || '').trim().toUpperCase();
    if (!short_code) return json({ error: 'short_code required' }, 400);

    if (action === 'get') {
      const r = await loadByShortCode(sb, activity.id, short_code);
      if ('error' in r) return json({ error: r.error }, 404);
      // 顺带把截图签名链接生成出来
      const screenshots = Array.isArray(r.app.publish_screenshots) ? r.app.publish_screenshots : [];
      const signed: { path: string; signed_url: string }[] = [];
      for (const p of screenshots) {
        const { data } = await sb.storage.from('voucher-screenshots').createSignedUrl(p, 600);
        if (data?.signedUrl) signed.push({ path: p, signed_url: data.signedUrl });
      }
      return json({
        ok: true,
        application: {
          publish_screenshots: screenshots,
          publish_screenshots_signed: signed,
          publish_url: r.app.publish_url,
          publish_confirm_note: r.app.publish_confirm_note,
          publish_confirmed: r.app.publish_confirmed,
          publish_confirmed_at: r.app.publish_confirmed_at,
          applicant_name: r.app.applicant_name,
        },
        claim: r.claim,
        voucher: activity.voucher,
      });
    }

    if (action === 'upload') {
      const r = await loadByShortCode(sb, activity.id, short_code);
      if ('error' in r) return json({ error: r.error }, 404);
      const data_url = String(body?.data_url || '');
      const decoded = decodeDataUrl(data_url);
      if (!decoded) return json({ error: 'invalid data_url' }, 400);
      if (decoded.bytes.length > 8 * 1024 * 1024) return json({ error: '图片过大（最大 8MB）' }, 400);
      if (!decoded.contentType.startsWith('image/')) return json({ error: '仅支持图片' }, 400);
      const ext = extFromContentType(decoded.contentType);
      const path = `publish/${r.app.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from('voucher-screenshots')
        .upload(path, decoded.bytes, { contentType: decoded.contentType, upsert: false });
      if (upErr) return json({ error: upErr.message }, 500);
      const { data: sig } = await sb.storage.from('voucher-screenshots').createSignedUrl(path, 600);
      return json({ ok: true, path, signed_url: sig?.signedUrl || null });
    }

    if (action === 'submit') {
      const r = await loadByShortCode(sb, activity.id, short_code);
      if ('error' in r) return json({ error: r.error }, 404);
      const screenshots = Array.isArray(body?.publish_screenshots)
        ? body.publish_screenshots.filter((x: unknown) => typeof x === 'string').slice(0, 20)
        : [];
      let publish_url: string | null = typeof body?.publish_url === 'string' ? body.publish_url.trim() : '';
      if (publish_url && publish_url.length > 500) return json({ error: '链接过长' }, 400);
      if (publish_url && !/^https?:\/\//i.test(publish_url)) {
        return json({ error: '链接需以 http(s):// 开头' }, 400);
      }
      if (!publish_url) publish_url = null;
      let note: string | null = typeof body?.note === 'string' ? body.note.trim() : '';
      if (note && note.length > 500) return json({ error: '备注过长' }, 400);
      if (!note) note = null;

      const { error: upErr } = await sb
        .from('activity_applications')
        .update({
          publish_screenshots: screenshots,
          publish_url,
          publish_confirm_note: note,
        })
        .eq('id', r.app.id);
      if (upErr) return json({ error: upErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

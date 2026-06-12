// 公开：凭 activity share_token 提交申请；图片字段走 base64 上传
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const share_token = body?.share_token;
    const applicant_name = String(body?.applicant_name || '').trim().slice(0, 50);
    const applicant_phone = String(body?.applicant_phone || '').trim();
    const form_data = body?.form_data || {};

    if (!share_token || !applicant_name || !applicant_phone) {
      return json({ error: '缺少必填字段' }, 400);
    }
    if (!/^1[3-9]\d{9}$/.test(applicant_phone)) return json({ error: '手机号格式不正确' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: activity, error: aErr } = await admin
      .from('activities')
      .select('id, status, form_fields, max_applications, starts_at, ends_at, requires_review, voucher_id')
      .eq('share_token', share_token)
      .maybeSingle();
    if (aErr || !activity) return json({ error: '活动不存在' }, 404);
    if (activity.status !== 'active') return json({ error: '活动已结束' }, 400);
    if (activity.starts_at && new Date(activity.starts_at) > new Date()) {
      return json({ error: '活动尚未开始' }, 400);
    }
    if (activity.ends_at && new Date(activity.ends_at) < new Date()) {
      return json({ error: '活动已结束' }, 400);
    }

    // 校验必填字段 + 处理图片字段
    const cleaned: Record<string, unknown> = {};
    for (const f of (activity.form_fields as Array<Record<string, unknown>>) || []) {
      const key = f.key as string;
      const required = !!f.required;
      const type = f.type as string;
      let val = form_data?.[key];
      if (required && (val === undefined || val === null || val === '')) {
        return json({ error: `请填写：${f.label}` }, 400);
      }
      if (type === 'image' && typeof val === 'string' && val.startsWith('data:')) {
        // base64 上传
        const match = val.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const contentType = match[1];
          const bin = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
          const ext = contentType.split('/')[1] || 'png';
          const path = `activity/${activity.id}/${crypto.randomUUID()}.${ext}`;
          const { error: uErr } = await admin.storage
            .from('voucher-screenshots')
            .upload(path, bin, { contentType, upsert: false });
          if (uErr) return json({ error: '截图上传失败：' + uErr.message }, 400);
          val = path;
        }
      }
      cleaned[key] = val ?? null;
    }

    // 限额
    if (activity.max_applications) {
      const { count } = await admin
        .from('activity_applications')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activity.id);
      if ((count ?? 0) >= activity.max_applications) {
        return json({ error: '本活动已达申请上限' }, 400);
      }
    }

    // 统一走"直接领取"流程（不再有审核分支）
    const { data: existing } = await admin
      .from('activity_applications')
      .select('id, voucher_claim_id, voucher_claim:voucher_claims(short_code)')
      .eq('activity_id', activity.id)
      .eq('applicant_phone', applicant_phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.voucher_claim_id && (existing as any).voucher_claim?.short_code) {
      return json({
        ok: true,
        requires_review: false,
        already: true,
        short_code: (existing as any).voucher_claim.short_code,
      });
    }

    const nowIso = new Date().toISOString();
    const { data: app, error: iErr } = await admin
      .from('activity_applications')
      .insert({
        activity_id: activity.id,
        applicant_name,
        applicant_phone,
        form_data: cleaned,
        status: 'approved',
        reviewed_at: nowIso,
      })
      .select('id')
      .single();
    if (iErr) return json({ error: iErr.message }, 400);

    const { data: claim, error: cErr } = await admin
      .from('voucher_claims')
      .insert({
        voucher_id: activity.voucher_id,
        activity_application_id: app.id,
        source: 'activity',
        status: 'claimed',
        recipient_name: applicant_name,
        recipient_phone: applicant_phone,
        claimed_at: nowIso,
      })
      .select('id, short_code')
      .single();
    if (cErr) return json({ error: cErr.message }, 400);

    await admin
      .from('activity_applications')
      .update({ voucher_claim_id: claim.id })
      .eq('id', app.id);

    return json({ ok: true, requires_review: false, short_code: claim.short_code });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

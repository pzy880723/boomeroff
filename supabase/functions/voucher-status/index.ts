// 公开：根据 share_token 或 (code+phone) 查询券状态
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const share_token = url.searchParams.get('share_token');
    const code = url.searchParams.get('code');
    const phone = url.searchParams.get('phone');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let q = supabase
      .from('vouchers')
      .select('id, code, share_token, status, applicant_name, applicant_phone, expires_at, approved_at, redeemed_at, reject_reason, type_id, note, created_at')
      .limit(1);

    if (share_token) {
      q = q.eq('share_token', share_token);
    } else if (code && phone) {
      q = q.eq('code', code).eq('applicant_phone', phone);
    } else {
      return new Response(JSON.stringify({ error: '缺少参数' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: v, error } = await q.maybeSingle();
    if (error) throw error;
    if (!v) {
      return new Response(JSON.stringify({ error: '未找到该券' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let type = null;
    if (v.type_id) {
      const { data: t } = await supabase
        .from('voucher_types')
        .select('id, name, description, face_value, valid_days, terms')
        .eq('id', v.type_id)
        .maybeSingle();
      type = t;
    }

    // 自动过期
    if (v.status === 'approved' && v.expires_at && new Date(v.expires_at) < new Date()) {
      await supabase.from('vouchers').update({ status: 'expired' }).eq('id', v.id);
      v.status = 'expired';
    }

    // 屏蔽手机号中段（如果是通过 share_token 查 + 未提交申请，则连姓名都不返回）
    const masked_phone = v.applicant_phone
      ? v.applicant_phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      : null;

    return new Response(
      JSON.stringify({
        id: v.id,
        code: v.code,
        share_token: v.share_token,
        status: v.status,
        applicant_name: v.applicant_name,
        applicant_phone: masked_phone,
        expires_at: v.expires_at,
        approved_at: v.approved_at,
        redeemed_at: v.redeemed_at,
        reject_reason: v.reject_reason,
        note: v.note,
        created_at: v.created_at,
        type,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

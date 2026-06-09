// 公开：客户填写申请 (姓名/电话/截图 base64)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const Body = z.object({
  share_token: z.string().uuid(),
  applicant_name: z.string().trim().min(1).max(50),
  applicant_phone: z.string().trim().regex(/^1\d{10}$/, '手机号格式不正确'),
  screenshot_base64: z.string().min(100), // dataURL or raw base64
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { share_token, applicant_name, applicant_phone, screenshot_base64 } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: v, error: ve } = await supabase
      .from('vouchers')
      .select('*')
      .eq('share_token', share_token)
      .maybeSingle();
    if (ve) throw ve;
    if (!v) {
      return new Response(JSON.stringify({ error: '券不存在' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (v.status !== 'pending_apply') {
      return new Response(JSON.stringify({ error: '该券当前不可申请', status: v.status }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 解析 base64 并上传
    let b64 = screenshot_base64;
    let mime = 'image/jpeg';
    const m = b64.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (m) {
      mime = m[1];
      b64 = m[2];
    }
    // 大小限制 ~ 8MB raw
    if (b64.length > 11_000_000) {
      return new Response(JSON.stringify({ error: '截图过大,请压缩后重试' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ext = mime.split('/')[1] === 'png' ? 'png' : 'jpg';
    const path = `${share_token}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase
      .storage
      .from('voucher-screenshots')
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) throw upErr;

    const now = new Date().toISOString();
    const { error: ue } = await supabase
      .from('vouchers')
      .update({
        applicant_name,
        applicant_phone,
        applicant_screenshot_url: path,
        applicant_submitted_at: now,
        status: 'pending_review',
      })
      .eq('id', v.id);
    if (ue) throw ue;

    await supabase.from('voucher_logs').insert({
      voucher_id: v.id,
      action: 'applied',
      actor_label: applicant_name,
      detail: { phone: applicant_phone },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// 需登录：店员/管理员扫码后核销 (code + share_token)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const Body = z.object({
  code: z.string().min(4),
  share_token: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: '请先登录店员账号' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: ce } = await supabaseUser.auth.getClaims(token);
    if (ce || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: '认证失败' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { code, share_token } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 权限校验：voucher.redeem
    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      _user_id: userId,
      _perm: 'voucher.redeem',
    });
    if (!hasPerm) {
      return new Response(JSON.stringify({ error: '无核销权限' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: v, error: ve } = await supabase
      .from('vouchers')
      .select('*')
      .eq('code', code)
      .eq('share_token', share_token)
      .maybeSingle();
    if (ve) throw ve;
    if (!v) {
      return new Response(JSON.stringify({ error: '券不存在或二维码无效' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (v.status === 'redeemed') {
      return new Response(JSON.stringify({ error: '该券已核销', status: 'redeemed', redeemed_at: v.redeemed_at }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (v.status !== 'approved') {
      return new Response(JSON.stringify({ error: `当前状态(${v.status})不可核销`, status: v.status }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (v.expires_at && new Date(v.expires_at) < new Date()) {
      await supabase.from('vouchers').update({ status: 'expired' }).eq('id', v.id);
      return new Response(JSON.stringify({ error: '该券已过期', status: 'expired' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const { error: ue } = await supabase
      .from('vouchers')
      .update({ status: 'redeemed', redeemed_by: userId, redeemed_at: now })
      .eq('id', v.id);
    if (ue) throw ue;

    await supabase.from('voucher_logs').insert({
      voucher_id: v.id,
      action: 'redeemed',
      actor_id: userId,
    });

    return new Response(JSON.stringify({ ok: true, voucher_id: v.id, code: v.code, redeemed_at: now }), {
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

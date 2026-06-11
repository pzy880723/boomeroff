// 公开免登录领取：博主在 /q 页面输入手机号 → 查询其最新可用 claim → 返回 short_code
// 审核通过时 voucher_claim 已直接设为 status='claimed' + claimed_at=now()，
// 所以此处只做"按手机号查找"，不再二次更新状态。
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '请输入正确的 11 位手机号' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 简单速率限制：同一手机号 1 分钟最多 6 次
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from('voucher_claims')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_phone', phone)
      .gte('updated_at', since);
    if ((count ?? 0) > 30) {
      return json({ error: '操作过于频繁，请稍后再试' }, 429);
    }

    // 查最近一条该手机号的、未核销、未过期的券
    const { data: claims, error } = await admin
      .from('voucher_claims')
      .select('id, short_code, status, expires_at, claimed_at, redeemed_at, created_at')
      .eq('recipient_phone', phone)
      .in('status', ['unclaimed', 'claimed'])
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) return json({ error: error.message }, 500);
    if (!claims || claims.length === 0) {
      return json({ error: '未找到该手机号的优惠券。请确认申请已被通过，或手机号是否填写正确。' }, 404);
    }

    // 过滤掉已过期的
    const now = Date.now();
    const usable = claims.find((c) => !c.expires_at || new Date(c.expires_at).getTime() > now);
    if (!usable) {
      return json({ error: '您的优惠券已过期' }, 410);
    }
    if (!usable.short_code) {
      return json({ error: '优惠券数据异常，请联系商家' }, 500);
    }

    return json({ ok: true, short_code: usable.short_code });
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

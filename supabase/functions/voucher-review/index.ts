// 需登录：管理员审核 (approve / reject) 及获取截图签名URL
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const Body = z.object({
  voucher_id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'revoke']),
  reason: z.string().max(200).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { voucher_id, action, reason } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: hasPerm } = await supabase.rpc('user_has_permission', {
      _user_id: userId, _perm: 'voucher.manage',
    });
    if (!hasPerm) {
      return new Response(JSON.stringify({ error: '无审核权限' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: v, error: ve } = await supabase
      .from('vouchers').select('*, voucher_types(valid_days)').eq('id', voucher_id).maybeSingle();
    if (ve) throw ve;
    if (!v) {
      return new Response(JSON.stringify({ error: '券不存在' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    let patch: Record<string, unknown> = {};
    let logAction = action;
    if (action === 'approve') {
      if (v.status !== 'pending_review') {
        return new Response(JSON.stringify({ error: '当前状态不可审核通过' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const days = (v as any).voucher_types?.valid_days ?? 30;
      const expires = new Date(now.getTime() + days * 24 * 3600 * 1000);
      patch = {
        status: 'approved',
        approved_by: userId,
        approved_at: now.toISOString(),
        expires_at: expires.toISOString(),
        reject_reason: null,
      };
      logAction = 'approved';
    } else if (action === 'reject') {
      patch = {
        status: 'rejected',
        approved_by: userId,
        approved_at: now.toISOString(),
        reject_reason: reason ?? null,
      };
      logAction = 'rejected';
    } else if (action === 'revoke') {
      patch = { status: 'revoked', reject_reason: reason ?? null };
      logAction = 'revoked';
    }

    const { error: ue } = await supabase.from('vouchers').update(patch).eq('id', voucher_id);
    if (ue) throw ue;

    await supabase.from('voucher_logs').insert({
      voucher_id, action: logAction, actor_id: userId,
      detail: reason ? { reason } : null,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

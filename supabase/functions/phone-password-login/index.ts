// 手机号 + 密码登录：手机号只用于服务端解析真实 Auth 账号，避免暴露邮箱映射。
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone, password } = await req.json().catch(() => ({}));
    if (!phone || !/^1[3-9]\d{9}$/.test(String(phone))) {
      return json({ error: '手机号格式不正确' }, 400);
    }
    if (!password || String(password).length < 6 || String(password).length > 72) {
      return json({ error: '账号或密码错误' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: uid, error: uidError } = await admin.rpc('find_user_id_by_phone', {
      _phone: String(phone),
    });
    if (uidError) return json({ error: '登录服务暂时不可用' }, 500);
    if (!uid) return json({ error: '账号或密码错误' }, 401);

    const { data: userInfo, error: userError } = await admin.auth.admin.getUserById(String(uid));
    const email = userInfo?.user?.email;
    if (userError || !email) return json({ error: '账号或密码错误' }, 401);

    const authClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password: String(password),
    });
    if (error || !data.session) {
      return json({ error: '账号或密码错误' }, error?.status === 429 ? 429 : 401);
    }

    return json({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (error) {
    console.error('[phone-password-login] unexpected error', error instanceof Error ? error.message : String(error));
    return json({ error: '登录服务暂时不可用' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

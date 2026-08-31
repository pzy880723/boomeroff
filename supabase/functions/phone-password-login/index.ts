// 手机号 + 密码登录：手机号只用于服务端解析真实 Auth 账号，避免暴露邮箱映射。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { findAuthUserByPhone, type AuthUserLike } from '../_shared/auth-user-phone.ts';

const DATABASE_LOOKUP_TIMEOUT_MS = 2500;

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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const databaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => fetch(input, {
            ...init,
            signal: AbortSignal.timeout(DATABASE_LOOKUP_TIMEOUT_MS),
          }),
        },
      },
    );

    let uid: string | null = null;
    let databaseLookupFailed = false;
    try {
      const result = await databaseAdmin.rpc('find_user_id_by_phone', {
        _phone: String(phone),
      });
      uid = result.data ? String(result.data) : null;
      databaseLookupFailed = Boolean(result.error);
    } catch {
      databaseLookupFailed = true;
    }

    let authUser: AuthUserLike | null = null;
    if (uid) {
      const { data: userInfo, error: userError } = await admin.auth.admin.getUserById(uid);
      if (!userError && userInfo?.user) authUser = userInfo.user;
    } else if (!databaseLookupFailed) {
      return json({ error: '账号或密码错误' }, 401);
    }

    if (!authUser && databaseLookupFailed) {
      try {
        authUser = await findAuthUserByPhone(async (page, perPage) => {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
          if (error) throw error;
          return data?.users ?? [];
        }, String(phone));
      } catch (error) {
        console.error(
          '[phone-password-login] auth directory lookup failed',
          error instanceof Error ? error.message : String(error),
        );
        return json({ error: '登录服务暂时不可用' }, 500);
      }
    }

    const email = authUser?.email;
    if (!email) return json({ error: '账号或密码错误' }, 401);

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

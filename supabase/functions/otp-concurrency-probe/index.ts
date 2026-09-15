// 临时并发验证探针（测试后立即删除）：不发送任何短信，只并发调用 issue_phone_otp_v1。
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOKEN = 'xykUwD2uPBTupuOpbPLRS9N7YlM09PWb';

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.token !== TOKEN) return new Response('no', { status: 403 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const calls = (body.calls ?? []) as Array<Record<string, unknown>>;
  const results = await Promise.all(
    calls.map((c) => admin.rpc('issue_phone_otp_v1', c).then((r) => r.data ?? { error: r.error?.message })),
  );
  if (body.cleanup_phones) {
    await admin.from('phone_login_otp').delete().in('phone', body.cleanup_phones as string[]);
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
});

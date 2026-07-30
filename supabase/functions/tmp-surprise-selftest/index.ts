// 临时自检函数：用真实用户会话对 surprise-marketing-video 做一次生产等价 submit。
// 用完立即删除。仅接受固定一次性口令。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ONE_TIME = "b7f2c1d9-selftest-20260730";

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({} as any));
    if (body?.token !== ONE_TIME) return new Response("no", { status: 403 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: userRes, error: uErr } = await admin.auth.admin.getUserById(body.user_id);
    if (uErr || !userRes?.user?.email) {
      return Response.json({ ok: false, step: "get_user", error: uErr?.message || "no email" });
    }
    const email = userRes.user.email;
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (lErr || !link?.properties?.hashed_token) {
      return Response.json({ ok: false, step: "gen_link", error: lErr?.message });
    }
    const anonClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { data: sess, error: vErr } = await anonClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    const accessToken = sess?.session?.access_token;
    if (vErr || !accessToken) return Response.json({ ok: false, step: "verify", error: vErr?.message });

    const res = await fetch(`${SUPABASE_URL}/functions/v1/surprise-marketing-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body.payload),
    });
    const text = await res.text();
    return Response.json({ ok: true, status: res.status, body: text.slice(0, 800) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

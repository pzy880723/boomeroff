// 创建火山真人认证 H5 会话
// 入参: { character_id }
// 出参: { ok, h5_url, session_id (内部 row id), byted_token }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { volcCall } from "../_shared/volc-sign.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const characterId = String(body.character_id || "");
    if (!characterId) return json({ ok: false, error: "缺少 character_id" });

    const callbackUrl = String(body.callback_url || "")
      || `${new URL(req.url).origin.replace("supabase.co", "lovable.app")}/verify-callback`;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: ch } = await admin.from("marketing_characters").select("id, shop_id, name").eq("id", characterId).maybeSingle();
    if (!ch) return json({ ok: false, error: "角色不存在" });

    const result = await volcCall<{ BytedToken: string; H5Link: string; CallbackURL: string }>({
      action: "CreateVisualValidateSession",
      body: { CallbackURL: callbackUrl, ProjectName: "default" },
    });
    if (!result.ok || !result.data?.H5Link) {
      console.error("[volc-identity-create-session]", result);
      return json({ ok: false, error: result.error || "创建认证会话失败", raw: result.raw });
    }

    const { data: row, error: insErr } = await admin.from("marketing_character_assets").insert({
      character_id: characterId,
      shop_id: (ch as any).shop_id || null,
      created_by: u.user.id,
      session_id: result.data.BytedToken,
      h5_url: result.data.H5Link,
      status: "pending",
      raw: { create_response: result.raw },
    }).select().single();
    if (insErr) {
      console.error("[volc-identity-create-session] insert", insErr);
      return json({ ok: false, error: "会话入库失败: " + insErr.message });
    }

    return json({
      ok: true,
      h5_url: result.data.H5Link,
      byted_token: result.data.BytedToken,
      session_id: row.id,
      callback_url: callbackUrl,
    });
  } catch (e) {
    console.error("[volc-identity-create-session] err", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

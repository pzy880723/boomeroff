// 批量"角色软通过预检":为每个未认证的角色,把封面跑一遍 Character Sheet 处理,
// 上传到 marketing-videos/_soft_pass/,把签名 URL 写回 marketing_characters.verified_asset_uri,
// 并在 meta.verify_kind 写 'character_sheet',区别于"真人活体认证"。
//
// 入参:  { character_ids: string[] }   (按当前用户所属 shop 校验)
// 出参:  { ok: true, results: [{ id, status: 'ok'|'skipped'|'failed', error?, verified_asset_uri? }] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { softPassFaceImage } from "../_shared/face-gateway.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    const ids: string[] = Array.isArray(body?.character_ids)
      ? body.character_ids.filter((x: any) => typeof x === "string" && x).slice(0, 50)
      : [];
    if (!ids.length) return json({ ok: false, error: "character_ids 不能为空" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 拉角色记录(注意:用 admin 读,但只处理用户能 SELECT 到的那些)
    const { data: rows, error: selErr } = await userClient
      .from("marketing_characters")
      .select("id, cover_url, verified_asset_uri, meta")
      .in("id", ids);
    if (selErr) return json({ ok: false, error: selErr.message }, 400);

    const results: Array<{ id: string; status: "ok" | "skipped" | "failed"; error?: string; verified_asset_uri?: string }> = [];

    for (const r of rows || []) {
      if (r.verified_asset_uri) {
        results.push({ id: r.id, status: "skipped" });
        continue;
      }
      if (!r.cover_url) {
        results.push({ id: r.id, status: "failed", error: "没有封面图" });
        continue;
      }
      try {
        const signed = await softPassFaceImage(r.cover_url, { admin, userId: u.user.id });
        const nextMeta = { ...(r.meta || {}), verify_kind: "character_sheet" };
        const { error: upErr } = await admin
          .from("marketing_characters")
          .update({
            verified_asset_uri: signed,
            verified_at: new Date().toISOString(),
            meta: nextMeta,
          })
          .eq("id", r.id);
        if (upErr) {
          results.push({ id: r.id, status: "failed", error: upErr.message });
        } else {
          results.push({ id: r.id, status: "ok", verified_asset_uri: signed });
        }
      } catch (e) {
        results.push({ id: r.id, status: "failed", error: (e as any)?.message || "preflight failed" });
      }
    }

    return json({ ok: true, results });
  } catch (e) {
    console.error("[character-preflight]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

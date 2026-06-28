// 批量"角色软通过预检":为每个未认证的角色,把封面跑一遍 Character Sheet 处理,
// 上传到 marketing-videos/_soft_pass/,把签名 URL 写回 marketing_characters.verified_asset_uri。
//
// 入参:  { character_ids: string[] }   (单次最多 50,前端按 50 一批分批调)
// 出参:  { ok: true, results: [{ id, status: 'ok'|'skipped'|'failed', error?, verified_asset_uri? }] }
//
// 服务端策略:并发上限 5 + 每个角色 25s 软超时,绝不让一张图卡死整批。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { softPassFaceImage } from "../_shared/face-gateway.ts";

type ResultRow = { id: string; status: "ok" | "skipped" | "failed"; error?: string; verified_asset_uri?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} 超时 (>${Math.round(ms / 1000)}s)`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
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

    console.log("[character-preflight] start", { user: u.user.id, count: ids.length });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // 拉角色记录(用 userClient,RLS 保证只能动自己 shop 的角色)
    const { data: rows, error: selErr } = await userClient
      .from("marketing_characters")
      .select("id, cover_url, verified_asset_uri, meta")
      .in("id", ids);
    if (selErr) return json({ ok: false, error: selErr.message }, 400);

    const results = await runPool(rows || [], 5, async (r): Promise<ResultRow> => {
      if (r.verified_asset_uri) return { id: r.id, status: "skipped" };
      if (!r.cover_url) return { id: r.id, status: "failed", error: "没有封面图" };
      try {
        const signed = await withTimeout(
          softPassFaceImage(r.cover_url, { admin, userId: u.user.id }),
          25_000,
          "软通过处理",
        );
        const nextMeta = { ...(r.meta || {}), verify_kind: "character_sheet" };
        const { error: upErr } = await admin
          .from("marketing_characters")
          .update({
            verified_asset_uri: signed,
            verified_at: new Date().toISOString(),
            meta: nextMeta,
          })
          .eq("id", r.id);
        if (upErr) return { id: r.id, status: "failed", error: upErr.message };
        return { id: r.id, status: "ok", verified_asset_uri: signed };
      } catch (e) {
        const msg = (e as any)?.message || "preflight failed";
        console.warn("[character-preflight] one failed", { id: r.id, msg });
        return { id: r.id, status: "failed", error: msg };
      }
    });

    const ok = results.filter((r) => r.status === "ok").length;
    const failed = results.filter((r) => r.status === "failed").length;
    console.log("[character-preflight] done", { ok, failed, skipped: results.length - ok - failed });

    return json({ ok: true, results });
  } catch (e) {
    console.error("[character-preflight]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

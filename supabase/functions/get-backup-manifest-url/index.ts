// Returns a short-lived, signed COS URL for downloading a backup run's manifest.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { readCosConfigFromEnv, signCos, cosHost } from "../_shared/tencentCos.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: { run_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  if (!body.run_id) return json({ error: "run_id 必填" }, 400);

  const { data: row, error } = await admin.from("backup_runs")
    .select("id, metadata").eq("id", body.run_id).maybeSingle();
  if (error || !row) return json({ error: "找不到那次备份" }, 404);
  const meta = (row as { metadata: { manifest_key?: string } }).metadata ?? {};
  if (!meta.manifest_key) return json({ error: "这次备份还没有生成清单" }, 404);

  try {
    const cfg = readCosConfigFromEnv();
    const pathname = `/${encodeURI(meta.manifest_key).replace(/%2F/g, "/")}`;
    const auth = await signCos({ cfg, method: "GET", pathname, expireSeconds: 900 });
    const url = `https://${cosHost(cfg)}${pathname}?${auth}`;
    return json({ ok: true, url, key: meta.manifest_key, expires_in: 900 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

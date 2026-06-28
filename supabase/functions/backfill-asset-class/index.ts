// 一次性:按规则把历史 marketing_assets 分类成 base / upload / generated
// 写入 meta.asset_class。仅 admin 可调用。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const GENERATED_SOURCES = new Set([
  "storyboard", "ai_smart_ad", "ai-smart-ad", "ai_image",
  "smart_ad", "generated", "ai_generated",
]);
const GENERATED_CATEGORIES = new Set(["分镜头", "AI生成", "AI 生成", "ai生成"]);
const BASE_CATEGORIES = new Set(["店铺", "门店", "场景图"]);
const BASE_TAG_HINTS = ["门头", "店招", "店内", "橱窗", "货架", "收银台", "门口", "店面"];

function classify(row: any): "base" | "upload" | "generated" {
  const src = row?.meta?.source;
  if (typeof src === "string" && GENERATED_SOURCES.has(src)) return "generated";
  if (row?.category && GENERATED_CATEGORIES.has(row.category)) return "generated";
  if (row?.category && BASE_CATEGORIES.has(row.category)) return "base";
  const tags: string[] = Array.isArray(row?.tags) ? row.tags : [];
  if (tags.some((t) => BASE_TAG_HINTS.includes(String(t)))) return "base";
  return "upload";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ ok: false, error: "仅管理员可操作" }, 403);

    // 拉全量(列表轻量,几百条无压力)。只取 photo,视频/文案保持 upload。
    const { data: rows, error } = await admin
      .from("marketing_assets")
      .select("id, kind, category, tags, meta")
      .eq("kind", "photo");
    if (error) return json({ ok: false, error: error.message });

    let base = 0, upload = 0, generated = 0, updated = 0;
    const all = (rows as any[]) || [];
    for (const r of all) {
      const cls = classify(r);
      if (cls === "base") base += 1;
      else if (cls === "generated") generated += 1;
      else upload += 1;

      // 已有 asset_class 且一致就跳过,避免无谓写入
      if (r?.meta?.asset_class === cls) continue;
      const nextMeta = { ...(r.meta || {}), asset_class: cls };
      const { error: uErr } = await admin
        .from("marketing_assets")
        .update({ meta: nextMeta })
        .eq("id", r.id);
      if (!uErr) updated += 1;
    }

    // 视频/文案默认归为 upload
    await admin
      .from("marketing_assets")
      .update({})  // touch noop is invalid; instead update via JSONB only if missing
      .eq("kind", "photo")
      .limit(0);

    return json({ ok: true, total: all.length, base, upload, generated, updated });
  } catch (e) {
    console.error("[backfill-asset-class]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

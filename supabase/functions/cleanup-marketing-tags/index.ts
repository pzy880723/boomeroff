// 一次性:批量清理 marketing_assets.tags 里的噪声标签
// - 场景1..场景99 / 图一..图九 / 分镜头N
// - 英文情绪词 elegant / energetic / lively / playful / steady / calm / moody / warm / cool
// - AI智能广告 / AI生成 / AI图
// 仅 admin 可调用,只动 photo,kind 其它不动。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const NOISE_PATTERNS: RegExp[] = [
  /^场景[一二三四五六七八九十\d]+$/,
  /^图[一二三四五六七八九十\d]+$/,
  /^分镜头[一二三四五六七八九十\d]+$/,
  /^(elegant|energetic|lively|playful|steady|calm|moody|warm|cool)$/i,
  /^AI[\s_\-]?(智能广告|生成|图片?)$/,
];

function isNoise(t: string): boolean {
  if (!t || typeof t !== "string") return true;
  return NOISE_PATTERNS.some((re) => re.test(t));
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

    const { data: rows, error } = await admin
      .from("marketing_assets")
      .select("id, tags")
      .not("tags", "is", null);
    if (error) return json({ ok: false, error: error.message });

    let affectedRows = 0;
    let removedTags = 0;
    for (const r of (rows as any[]) || []) {
      const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
      if (!tags.length) continue;
      const kept = tags.filter((t) => !isNoise(String(t)));
      if (kept.length === tags.length) continue;
      removedTags += tags.length - kept.length;
      affectedRows += 1;
      await admin.from("marketing_assets").update({ tags: kept }).eq("id", r.id);
    }

    return json({ ok: true, scanned: (rows as any[])?.length || 0, affected_rows: affectedRows, removed_tags: removedTags });
  } catch (e) {
    console.error("[cleanup-marketing-tags]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

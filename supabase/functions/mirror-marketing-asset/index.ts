// 把营销素材(视频)的一次性 TOS 链接转存到 Supabase Storage 拿长期链接。
// - POST { asset_id }  由前端"视频加载失败 → 刷新链接"按钮调用
// - POST { backfill: true, limit?: number }  仅 admin,一次性回补历史所有 TOS 视频
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isVolcesTosUrl, isSupabaseStorageUrl, mirrorTosVideoToStorage } from "../_shared/mirror-tos-video.ts";

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
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    if (!SUPABASE_URL || !SERVICE || !ANON) return json({ error: "服务器配置缺失" }, 500);

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "请先登录" }, 401);
    const uid = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({} as any));

    // -------- 单个素材刷新 --------
    if (body?.asset_id) {
      const assetId = String(body.asset_id);
      const { data: asset } = await admin
        .from("marketing_assets")
        .select("id, kind, output_url, user_id, shop_id, meta")
        .eq("id", assetId)
        .maybeSingle();
      if (!asset) return json({ error: "素材不存在" }, 404);
      if (asset.kind !== "video") return json({ error: "仅支持视频素材" }, 400);
      // 归属校验:同 shop 员工或本人
      if (asset.user_id !== uid) {
        const { data: sp } = await admin.from("staff_profiles").select("shop_id").eq("user_id", uid).maybeSingle();
        if (!asset.shop_id || !sp?.shop_id || asset.shop_id !== sp.shop_id) {
          return json({ error: "无权刷新此素材" }, 403);
        }
      }
      const url = asset.output_url as string | null;
      if (!url) return json({ error: "素材还没有生成完成" }, 409);
      if (isSupabaseStorageUrl(url)) return json({ ok: true, url, already: true });
      if (!isVolcesTosUrl(url)) return json({ error: "不支持的素材来源" }, 400);

      const result = await mirrorTosVideoToStorage(admin, asset.user_id as string, assetId, url);
      if (!result.ok) {
        // 只有源站明确返回无权限/不存在才永久标记过期。网络或 Storage
        // 临时故障保留重试能力，避免一个瞬时错误毁掉仍有效的视频。
        const failedAt = new Date().toISOString();
        await admin.from("marketing_assets").update({
          meta: result.sourceExpired
            ? { ...(asset.meta || {}), status: "expired", expired_at: failedAt, mirror_error: result.error }
            : { ...(asset.meta || {}), status: "mirror_failed", mirror_failed_at: failedAt, mirror_error: result.error },
        }).eq("id", assetId);
        return result.sourceExpired
          ? json({ error: result.error, expired: true }, 410)
          : json({ error: result.error, retryable: true }, 502);
      }
      await admin.from("marketing_assets").update({
        output_url: result.url,
        meta: {
          ...(asset.meta || {}),
          tos_url_original: url,
          storage_path: result.path,
          mirrored_at: new Date().toISOString(),
        },
      }).eq("id", assetId);
      return json({ ok: true, url: result.url, mirrored: true });
    }

    // -------- 批量回补 --------
    if (body?.backfill) {
      const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
      if ((roleRow as any)?.role !== "admin") return json({ error: "仅管理员可执行回补" }, 403);
      const limit = Math.max(1, Math.min(Number(body?.limit) || 30, 100));
      const { data: rows } = await admin
        .from("marketing_assets")
        .select("id, output_url, user_id, meta")
        .eq("kind", "video")
        .not("output_url", "is", null)
        .like("output_url", "%volces.com%")
        .order("created_at", { ascending: false })
        .limit(limit);
      const results: any[] = [];
      for (const row of (rows as any[]) || []) {
        const meta = row.meta || {};
        if (meta.status === "expired") { results.push({ id: row.id, skipped: "expired" }); continue; }
        const r = await mirrorTosVideoToStorage(admin, row.user_id, row.id, row.output_url);
        if (!r.ok) {
          const failedAt = new Date().toISOString();
          await admin.from("marketing_assets").update({
            meta: r.sourceExpired
              ? { ...meta, status: "expired", expired_at: failedAt, mirror_error: r.error }
              : { ...meta, status: "mirror_failed", mirror_failed_at: failedAt, mirror_error: r.error },
          }).eq("id", row.id);
          results.push({ id: row.id, expired: r.sourceExpired, retryable: !r.sourceExpired, error: r.error });
        } else {
          await admin.from("marketing_assets").update({
            output_url: r.url,
            meta: { ...meta, tos_url_original: row.output_url, storage_path: r.path, mirrored_at: new Date().toISOString() },
          }).eq("id", row.id);
          results.push({ id: row.id, mirrored: true });
        }
      }
      return json({ ok: true, count: results.length, results });
    }

    return json({ error: "缺少 asset_id 或 backfill" }, 400);
  } catch (e) {
    return json({ error: (e as Error)?.message || "服务器错误" }, 500);
  }
});

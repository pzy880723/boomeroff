// 接收前端从 <video> 抓下来的一帧图,写入 marketing-videos/<uid>/posters/<assetId>.jpg,
// 更新 marketing_assets.meta.poster_url 为 10 年签名 URL。
// Body: { asset_id: string, image_base64: string }  image_base64 = "data:image/jpeg;base64,...."
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function decodeBase64Image(input: string): { bytes: Uint8Array; contentType: string } | null {
  try {
    const m = input.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if (!m) return null;
    const contentType = m[1].toLowerCase();
    const b64 = m[2];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.byteLength < 512) return null;
    return { bytes, contentType };
  } catch { return null; }
}

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

    const body = await req.json().catch(() => ({} as any));
    const assetId = String(body?.asset_id || "");
    const image = String(body?.image_base64 || "");
    if (!assetId || !image) return json({ error: "缺少 asset_id 或图像" }, 400);
    const decoded = decodeBase64Image(image);
    if (!decoded) return json({ error: "图像格式不支持" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: asset } = await admin
      .from("marketing_assets")
      .select("id, kind, user_id, shop_id, meta")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset) return json({ error: "素材不存在" }, 404);
    if ((asset as any).kind !== "video") return json({ error: "仅视频可换封面" }, 400);

    // 归属校验:本人或同店员工
    if ((asset as any).user_id !== uid) {
      const { data: sp } = await admin.from("staff_profiles").select("shop_id").eq("user_id", uid).maybeSingle();
      const shopId = (asset as any).shop_id;
      if (!shopId || !(sp as any)?.shop_id || shopId !== (sp as any).shop_id) {
        return json({ error: "无权修改此素材" }, 403);
      }
    }

    const ext = decoded.contentType.split("/")[1] || "jpg";
    const path = `${(asset as any).user_id}/posters/${assetId}.${ext === "jpeg" ? "jpg" : ext}`;
    const up = await admin.storage.from("marketing-videos").upload(path, decoded.bytes, {
      contentType: decoded.contentType, upsert: true, cacheControl: "31536000",
    });
    if (up.error) return json({ error: "上传失败: " + up.error.message }, 500);
    const signed = await admin.storage.from("marketing-videos").createSignedUrl(path, TEN_YEARS);
    const url = signed.data?.signedUrl;
    if (!url) return json({ error: "签名失败" }, 500);

    const meta = { ...((asset as any).meta || {}), poster_url: url, poster_updated_at: new Date().toISOString() };
    await admin.from("marketing_assets").update({ meta }).eq("id", assetId);
    return json({ ok: true, url });
  } catch (e) {
    return json({ error: (e as Error)?.message || "服务器错误" }, 500);
  }
});

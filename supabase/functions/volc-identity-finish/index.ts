// 完成认证: 取 GroupId → 对角色的每张参考图调用 CreateAsset → 轮询 GetAsset 至 Active
// 入参: { character_id }   (后端用最新 pending session)
// 出参: { ok, asset_id, asset_uri, status }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { volcCall } from "../_shared/volc-sign.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PROJECT_NAME = "default";

async function waitAssetActive(assetId: string, maxMs = 25_000): Promise<{ ok: boolean; status?: string; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await volcCall<{ Status: string }>({
      action: "GetAsset",
      body: { Id: assetId, ProjectName: PROJECT_NAME },
    });
    if (!r.ok) return { ok: false, error: r.error };
    const status = r.data?.Status;
    if (status === "Active") return { ok: true, status };
    if (status === "Failed") return { ok: false, status, error: "素材处理失败(人脸不一致或内容违规)" };
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { ok: false, error: "素材入库超时，请稍后重试" };
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
    const characterId = String(body.character_id || "");
    if (!characterId) return json({ ok: false, error: "缺少 character_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: ch } = await admin.from("marketing_characters")
      .select("id, cover_url, ref_image_urls")
      .eq("id", characterId).maybeSingle();
    if (!ch) return json({ ok: false, error: "角色不存在" });

    // 取最近的 pending session
    const { data: sess } = await admin.from("marketing_character_assets")
      .select("id, session_id, status")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (!sess?.session_id) return json({ ok: false, error: "未找到认证会话，请先发起认证" });

    // 1) GetVisualValidateResult -> GroupId
    const gr = await volcCall<{ GroupId: string }>({
      action: "GetVisualValidateResult",
      body: { BytedToken: sess.session_id, ProjectName: PROJECT_NAME },
    });
    if (!gr.ok || !gr.data?.GroupId) {
      await admin.from("marketing_character_assets")
        .update({ status: "failed", error_reason: gr.error || "未通过真人认证" })
        .eq("id", sess.id);
      return json({ ok: false, error: gr.error || "未完成真人认证，请重新扫码" });
    }
    const groupId = gr.data.GroupId;

    // 2) 选一张人脸特写图入库(优先 cover_url)
    const refUrls: string[] = Array.isArray((ch as any).ref_image_urls) ? (ch as any).ref_image_urls : [];
    const sourceUrl = (ch as any).cover_url || refUrls[0];
    if (!sourceUrl) return json({ ok: false, error: "角色未配置参考图，无法入库" });

    const ca = await volcCall<{ Id: string }>({
      action: "CreateAsset",
      body: {
        GroupId: groupId,
        URL: sourceUrl,
        AssetType: "Image",
        Name: `character-${characterId.slice(0, 8)}`,
        ProjectName: PROJECT_NAME,
      },
    });
    if (!ca.ok || !ca.data?.Id) {
      const errMsg = ca.error || "素材入库失败";
      await admin.from("marketing_character_assets")
        .update({ status: "failed", error_reason: errMsg, raw: { ...(((sess as any)?.raw) || {}), create_asset: ca.raw } })
        .eq("id", sess.id);
      return json({ ok: false, error: errMsg, raw: ca.raw });
    }
    const assetId = ca.data.Id;
    const assetUri = `asset://${assetId}`;

    // 3) 轮询至 Active
    const wait = await waitAssetActive(assetId, 25_000);
    if (!wait.ok) {
      await admin.from("marketing_character_assets")
        .update({ status: "failed", asset_id: assetId, asset_uri: assetUri, error_reason: wait.error || "素材未就绪" })
        .eq("id", sess.id);
      return json({ ok: false, error: wait.error || "素材未就绪", asset_id: assetId });
    }

    // 4) 写回 character_assets + characters
    await admin.from("marketing_character_assets").update({
      status: "verified",
      asset_id: assetId,
      asset_uri: assetUri,
      error_reason: null,
    }).eq("id", sess.id);

    await admin.from("marketing_characters").update({
      verified_asset_id: assetId,
      verified_asset_uri: assetUri,
      verified_at: new Date().toISOString(),
    }).eq("id", characterId);

    return json({ ok: true, asset_id: assetId, asset_uri: assetUri, status: "verified" });
  } catch (e) {
    console.error("[volc-identity-finish] err", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "服务器错误" });
  }
});

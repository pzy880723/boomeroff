// 一次性回填 storage 中已有的分镜头 PNG 到 marketing_assets「分镜头」类别
// 仅管理员可调用。幂等:按 (user_id, sha256) 去重。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const isAdmin = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!isAdmin.data) return json({ ok: false, error: "仅管理员可执行" }, 403);

    // 列 storage 中所有 storyboards/{shop}/{session}/{idx}.png
    // storage.list 不支持递归,我们用 SQL 查 storage.objects
    const { data: objects, error: objErr } = await admin
      .schema("storage" as any)
      .from("objects")
      .select("name")
      .eq("bucket_id", "marketing-videos")
      .like("name", "storyboards/%")
      .limit(2000);
    if (objErr) return json({ ok: false, error: "列文件失败:" + objErr.message }, 500);

    let inserted = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    // 预扫:每个 session_id → user_id 的映射(从 marketing_video_jobs)
    const sessionUserMap = new Map<string, { user_id: string; shop_id: string | null }>();

    for (const obj of objects || []) {
      const name = (obj as any).name as string;
      const m = name.match(/^storyboards\/([^/]+)\/([^/]+)\/(\d+)\.png$/);
      if (!m) { skipped++; continue; }
      const [, shopFromPath, sessionId, idxStr] = m;
      const idx = parseInt(idxStr, 10);

      try {
        // 反查 user_id:从 marketing_video_jobs 找匹配 session_id 的任意一条
        let resolved = sessionUserMap.get(sessionId);
        if (!resolved) {
          const job = await admin.from("marketing_video_jobs")
            .select("user_id, shop_id, script")
            .or(`script->>session_id.eq.${sessionId},script->>storyboard_session_id.eq.${sessionId}`)
            .limit(1).maybeSingle();
          if (job.data) {
            resolved = { user_id: job.data.user_id, shop_id: job.data.shop_id };
          } else {
            // 回退:用门店里任一个用户(此 shop 的成员中任一管理员)
            const anyUser = await admin.from("staff_profiles")
              .select("user_id").eq("shop_id", shopFromPath).limit(1).maybeSingle();
            if (anyUser.data?.user_id) {
              resolved = { user_id: anyUser.data.user_id, shop_id: shopFromPath };
            } else {
              // 实在没人,挂在当前管理员名下
              resolved = { user_id: u.user.id, shop_id: shopFromPath };
            }
          }
          sessionUserMap.set(sessionId, resolved);
        }

        // 下载字节算 sha256
        const dl = await admin.storage.from("marketing-videos").download(name);
        if (dl.error || !dl.data) throw new Error("download:" + (dl.error?.message || "empty"));
        const bytes = new Uint8Array(await dl.data.arrayBuffer());
        const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
        const sha256 = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");

        // 去重
        const dup = await admin.from("marketing_assets")
          .select("id").eq("user_id", resolved.user_id).eq("sha256", sha256).maybeSingle();
        if (dup.data) { skipped++; continue; }

        // 签名 URL
        const signed = await admin.storage.from("marketing-videos").createSignedUrl(name, 60 * 60 * 24 * 30);
        if (!signed.data?.signedUrl) throw new Error("签名失败");

        await admin.from("marketing_assets").insert({
          user_id: resolved.user_id,
          shop_id: resolved.shop_id,
          kind: "photo",
          output_url: signed.data.signedUrl,
          category: "分镜头",
          tags: ["分镜头", `场景${idx + 1}`],
          sha256,
          meta: {
            source: "storyboard",
            session_id: sessionId,
            scene_index: idx,
            storage_bucket: "marketing-videos",
            storage_path: name,
            backfilled: true,
          },
        });
        inserted++;
      } catch (e) {
        failed++;
        if (errors.length < 10) errors.push(name + ":" + (e instanceof Error ? e.message : String(e)));
      }
    }

    return json({ ok: true, total: (objects || []).length, inserted, skipped, failed, sample_errors: errors });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

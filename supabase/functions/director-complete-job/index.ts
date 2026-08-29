// director-complete-job:
// 前端把客户端拼接后的成片 URL(或单镜 URL,当只有一段时)交回来,
// 落最终成片 + 入 marketing_assets 素材库,job.status='done'。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertStoreAccess, StoreAccessError } from "../_shared/store-access.ts";

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
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id;
    const finalVideoUrl: string = body.final_video_url;
    const coverUrl: string | undefined = body.cover_url;
    if (!jobId || !finalVideoUrl) return json({ ok: false, error: "缺少 final_video_url" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);
    await assertStoreAccess(admin, u.user.id, job.shop_id || null);

    // 成片必须有对应素材记录，否则后续“一键发布”无法形成闭环。
    let assetId = (job.meta as any)?.generated_asset_id as string | undefined;
    if (!assetId) {
      const { data: existing } = await admin.from("marketing_assets")
        .select("id")
        .contains("meta", { director_job_id: jobId })
        .limit(1)
        .maybeSingle();
      assetId = existing?.id;
    }
    if (!assetId) {
      const script = job.script_json as any;
      const publishCopy = (job.meta as any)?.publish_copy || null;
      const videoCopy = publishCopy ? {
        title: publishCopy.title || publishCopy.cover_title || '',
        body: publishCopy.body || publishCopy.caption || publishCopy.douyin_caption || '',
        hashtags: Array.isArray(publishCopy.hashtags) ? publishCopy.hashtags : [],
        first_comment: publishCopy.first_comment || '',
        shop_details: publishCopy.shop_details || null,
      } : null;
      const title = publishCopy?.cover_title || script?.title || 'BOOMER 惊喜一下 · 探店短片';
      const tags = publishCopy?.hashtags?.length
        ? publishCopy.hashtags.slice(0, 5).map((h: string) => h.replace(/^#/, ''))
        : ['惊喜一下', '探店', 'BOOMER'];
      const finalCover = coverUrl || (job.character_json as any)?.reference_image_url || null;
      // marketing_assets 没有 cover_url 列，封面必须放进 meta（与 compose-callback 对齐）。
      const { data: createdAsset, error: assetError } = await admin.from("marketing_assets").insert({
        user_id: job.user_id,
        shop_id: job.shop_id,
        kind: 'video',
        output_url: finalVideoUrl,
        output_text: videoCopy?.body || publishCopy?.caption || title,
        category: '惊喜一下',
        tags,
        meta: {
          title,
          summary: title,
          source: 'director',
          director_job_id: jobId,
          cover_url: finalCover,
          poster_url: finalCover,
          duration_s: job.duration,
          publish_copy: publishCopy,
          video_copy: videoCopy,
          subtitles: (job.meta as any)?.subtitles || null,
        } as any,
      }).select("id").single();
      if (assetError || !createdAsset?.id) {
        throw new Error(`成片写入素材库失败: ${assetError?.message || 'missing asset id'}`);
      }
      assetId = createdAsset.id;
    }

    await admin.from("video_generation_jobs").update({
      status: 'done',
      final_video_url: finalVideoUrl,
      cover_url: coverUrl || (job.character_json as any)?.reference_image_url || null,
      meta: { ...((job.meta as any) || {}), generated_asset_id: assetId },
    }).eq("id", jobId);

    return json({ ok: true, asset_id: assetId });
  } catch (e) {
    console.error("[director-complete-job] fatal", e);
    return json(
      { ok: false, error: (e as Error).message || String(e) },
      e instanceof StoreAccessError ? e.status : 500,
    );
  }
});

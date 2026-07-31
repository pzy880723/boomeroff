// cover-callback: Worker 生成完全新封面后回写。
// 成功 { job_id, cover_url, reference_frame_count, copy_fingerprint, variation_key }
// 失败 { job_id, error } → 直接写 failed,绝不用视频帧截图降级。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mergeCoverGeneration, readCoverGeneration, resolveCoverWorkerToken } from "../_shared/cover-generation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const TOKEN = resolveCoverWorkerToken();
    if (!TOKEN) return json({ ok: false, error: "COVER_WORKER_TOKEN / WORKER_SHARED_SECRET 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId: string = body.job_id;
    const coverUrl: string | undefined = body.cover_url;
    const errorMessage: string | undefined = body.error;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin
      .from("marketing_video_jobs")
      .select("id, user_id, shop_id, fallback_notes")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    const cg = readCoverGeneration(job.fallback_notes);
    if (!cg) return json({ ok: false, error: "该任务没有封面生成计划" }, 409);

    const nowIso = new Date().toISOString();

    // 失败:写 failed,不做任何截图降级
    if (errorMessage || !coverUrl) {
      if (cg.status === "succeeded") return json({ ok: true, idempotent: true });
      await admin.from("marketing_video_jobs").update({
        fallback_notes: mergeCoverGeneration(job.fallback_notes, {
          status: "failed",
          error: errorMessage || "Worker 未返回封面 URL",
          finished_at: nowIso,
          progress: null,
        }),
      }).eq("id", jobId);
      return json({ ok: true, marked: "failed" });
    }

    // 幂等:已成功且 URL 相同直接返回
    if (cg.status === "succeeded" && cg.cover_url === coverUrl) {
      return json({ ok: true, idempotent: true, cover_url: coverUrl });
    }

    const referenceFrameCount = Number(body.reference_frame_count) || 0;
    const copyFingerprint = body.copy_fingerprint || cg.copy_fingerprint;
    const variationKey = body.variation_key || cg.variation_key;

    await admin.from("marketing_video_jobs").update({
      fallback_notes: mergeCoverGeneration(job.fallback_notes, {
        status: "succeeded",
        cover_url: coverUrl,
        reference_frame_count: referenceFrameCount,
        copy_fingerprint: copyFingerprint,
        variation_key: variationKey,
        error: null,
        finished_at: nowIso,
        progress: { percent: 100, stage: "done", message: "封面已生成" },
      }),
    }).eq("id", jobId);

    // 同步到素材库:只合并封面相关字段,不动视频信息
    let assetId: string | null = null;
    let assetError: string | null = null;
    try {
      const { data: asset } = await admin
        .from("marketing_assets")
        .select("id, meta")
        .eq("kind", "video")
        .filter("meta->>job_id", "eq", jobId)
        .maybeSingle();
      if (asset) {
        const meta = {
          ...((asset.meta as any) || {}),
          cover_url: coverUrl,
          poster_url: coverUrl,
          cover_source: "seedream-worker",
          cover_generated_at: nowIso,
          cover_reference_frame_count: referenceFrameCount,
          cover_copy: cg.copy,
          cover_variation: cg.variation,
          cover_copy_fingerprint: copyFingerprint,
          cover_variation_key: variationKey,
        };
        const { error: updErr } = await admin.from("marketing_assets").update({ meta }).eq("id", asset.id);
        if (updErr) throw updErr;
        assetId = asset.id;
      }
    } catch (e) {
      assetError = (e as Error).message || String(e);
      console.error("[cover-callback] asset update failed", assetError);
    }

    return json({ ok: true, cover_url: coverUrl, asset_id: assetId, asset_error: assetError });
  } catch (e) {
    console.error("[cover-callback] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

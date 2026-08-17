// cover-callback: Worker 生成完全新封面后回写。
// 成功 { job_id, cover_url, reference_frame_count, copy_fingerprint, variation_key, cover_style_key, cover_style_label }
// 失败 { job_id, error } → 直接写 failed,绝不用视频帧截图降级。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mergeCoverGeneration, readCoverGeneration, resolveCoverWorkerToken } from "../_shared/cover-generation.ts";
import { mirrorTosVideoToStorage } from "../_shared/mirror-tos-video.ts";

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
    if (!TOKEN) return json({ ok: false, error: "封面 Worker Token 未配置" }, 500);
    if (req.headers.get("x-worker-token") !== TOKEN) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId: string = body.job_id;
    const coverUrl: string | undefined = body.cover_url;
    const optimizedVideoUrl: string | undefined = body.optimized_video_url;
    const deliveryVideoUrl: string | undefined = body.delivery_video_url;
    const storefrontLocked: boolean = body.storefront_locked === true;
    const storefrontReferenceUrl: string | null = typeof body.storefront_reference_url === "string"
      ? body.storefront_reference_url
      : null;
    const errorMessage: string | undefined = body.error;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin
      .from("marketing_video_jobs")
      .select("id, user_id, shop_id, fallback_notes, video_url, segment_url")
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
    if (cg.status === "succeeded" && cg.cover_url === coverUrl && !optimizedVideoUrl) {
      return json({ ok: true, idempotent: true, cover_url: coverUrl });
    }

    const referenceFrameCount = Number(body.reference_frame_count) || 0;
    const copyFingerprint = body.copy_fingerprint || cg.copy_fingerprint;
    const variationKey = body.variation_key || cg.variation_key;
    const coverStyleKey = String(body.cover_style_key || "").trim() || null;
    const coverStyleLabel = String(body.cover_style_label || "").trim() || null;

    await admin.from("marketing_video_jobs").update({
      fallback_notes: mergeCoverGeneration(job.fallback_notes, {
        status: "succeeded",
        cover_url: coverUrl,
        reference_frame_count: referenceFrameCount,
        copy_fingerprint: copyFingerprint,
        variation_key: variationKey,
        style_key: coverStyleKey,
        style_label: coverStyleLabel,
        error: null,
        finished_at: nowIso,
        progress: { percent: 100, stage: "done", message: "封面已生成" },
      }),
    }).eq("id", jobId);

    // 同步到素材库，并把 Worker 处理过的 Fast Start MP4 覆盖回长期地址。
    let assetId: string | null = null;
    let assetError: string | null = null;
    let stableVideoUrl: string | null = null;
    let streamOptimized = false;
    try {
      const { data: asset } = await admin
        .from("marketing_assets")
        .select("id, meta, output_url")
        .eq("kind", "video")
        .filter("meta->>job_id", "eq", jobId)
        .maybeSingle();
      if (asset) {
        let meta = {
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
          cover_style_key: coverStyleKey,
          cover_style_label: coverStyleLabel,
          storefront_opening_locked: storefrontLocked,
          storefront_reference_url: storefrontReferenceUrl,
        };
        if (optimizedVideoUrl) {
          const mirrored = await mirrorTosVideoToStorage(
            admin,
            job.user_id,
            asset.id,
            optimizedVideoUrl,
          );
          if (mirrored.ok) {
            stableVideoUrl = deliveryVideoUrl || mirrored.url;
            streamOptimized = true;
            meta = {
              ...meta,
              storage_path: mirrored.path,
              storage_backup_url: mirrored.url,
              delivery_video_url: stableVideoUrl,
              stream_faststart: true,
              stream_optimized_at: nowIso,
              stream_optimize_error: null,
            };
          } else {
            meta = {
              ...meta,
              stream_faststart: false,
              stream_optimize_error: mirrored.error,
            };
          }
        }
        const assetUpdate: Record<string, unknown> = { meta };
        if (stableVideoUrl) assetUpdate.output_url = stableVideoUrl;
        const { error: updErr } = await admin
          .from("marketing_assets")
          .update(assetUpdate)
          .eq("id", asset.id);
        if (updErr) throw updErr;
        assetId = asset.id;

        if (stableVideoUrl) {
          const { error: jobVideoErr } = await admin
            .from("marketing_video_jobs")
            .update({ video_url: stableVideoUrl, segment_url: stableVideoUrl })
            .eq("id", jobId);
          if (jobVideoErr) throw jobVideoErr;
        }
      }
    } catch (e) {
      assetError = (e as Error).message || String(e);
      console.error("[cover-callback] asset update failed", assetError);
    }

    return json({
      ok: true,
      cover_url: coverUrl,
      asset_id: assetId,
      asset_error: assetError,
      video_url: stableVideoUrl,
      stream_faststart: streamOptimized,
    });
  } catch (e) {
    console.error("[cover-callback] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

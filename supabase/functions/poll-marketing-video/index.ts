// 轮询火山方舟 Seedance 任务状态。
// - 单段任务: 直接查 ark, 回写 video_url。
// - 父任务(segment_total>1 且无 provider_task_id): 轮询每个子段, 汇总状态;
//   全部成功后把 segment_urls 返回给前端, 由前端用 mediabunny 拼接并回写。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_TASK_BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const ARK_PROXY_PREFIX = "/functions/v1/poll-marketing-video?segment=";

function mapArkStatus(s: string): string {
  if (s === "succeeded") return "succeeded";
  if (s === "failed" || s === "expired" || s === "cancelled") return "failed";
  if (s === "queued") return "queued";
  return "running";
}

function encodeSegmentUrl(url: string): string {
  return `${ARK_PROXY_PREFIX}${encodeURIComponent(url)}`;
}

function decodeSegmentUrl(req: Request): string | null {
  const url = new URL(req.url);
  const seg = url.searchParams.get("segment");
  if (!seg) return null;
  let decoded = seg;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function isAllowedSegmentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      u.hostname === "ark-content-generation-cn-beijing.tos-cn-beijing.volces.com" &&
      u.pathname.endsWith(".mp4");
  } catch {
    return false;
  }
}

async function pollOne(arkKey: string, taskId: string) {
  const arkRes = await fetch(`${ARK_TASK_BASE}/${taskId}`, {
    headers: { "Authorization": `Bearer ${arkKey}` },
  });
  const arkJson: any = await arkRes.json().catch(() => ({}));
  if (!arkRes.ok) {
    return { status: "running" as const, video_url: null, error: arkJson?.error?.message || `查询失败(${arkRes.status})`, mapped: "running" };
  }
  const raw: string = arkJson.status || "running";
  return {
    status: raw,
    video_url: (arkJson?.content?.video_url || arkJson?.video_url) as string | null,
    error: arkJson?.error?.message as string | undefined,
    mapped: mapArkStatus(raw),
  };
}

async function updateAssetMeta(
  admin: any, userId: string, jobId: string, patch: Record<string, unknown>, outputUrl?: string | null,
) {
  const { data: asset } = await admin
    .from("marketing_assets")
    .select("id, meta")
    .eq("user_id", userId)
    .eq("kind", "video")
    .filter("meta->>job_id", "eq", jobId)
    .maybeSingle();
  if (!asset) return;
  const newMeta = { ...(asset.meta || {}), ...patch };
  const update: Record<string, unknown> = { meta: newMeta };
  if (outputUrl !== undefined) update.output_url = outputUrl;
  await admin.from("marketing_assets").update(update).eq("id", asset.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const segmentUrl = decodeSegmentUrl(req);
    if (req.method === "GET" && segmentUrl) {
      if (!isAllowedSegmentUrl(segmentUrl)) return json({ error: "不支持的分段地址" }, 400);

      const range = req.headers.get("range");
      const upstream = await fetch(segmentUrl, {
        headers: range ? { range } : undefined,
      });
      if (!upstream.ok || !upstream.body) {
        return json({ error: `分段读取失败(${upstream.status})` }, upstream.status || 502);
      }

      const headers = new Headers(corsHeaders);
      headers.set("Content-Type", upstream.headers.get("Content-Type") || "video/mp4");
      const length = upstream.headers.get("Content-Length");
      const rangeOut = upstream.headers.get("Content-Range");
      const acceptRanges = upstream.headers.get("Accept-Ranges");
      if (length) headers.set("Content-Length", length);
      if (rangeOut) headers.set("Content-Range", rangeOut);
      if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
      headers.set("Cache-Control", "private, max-age=3600");
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ error: "未配置 ARK_API_KEY" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // ============ Sweep 模式:由 pg_cron 每分钟调用,无需用户 auth ============
    const urlObj = new URL(req.url);
    const isSweep = urlObj.searchParams.get("mode") === "sweep";
    if (isSweep) {
      // 按模型+分辨率分级超时:Pro 模型可能要 15-20 分钟,Fast/Mini 几分钟搞定
      const timeoutMinFor = (model?: string | null, resolution?: string | null) => {
        const m = (model || "").toLowerCase();
        const r = (resolution || "").toLowerCase();
        if (m.includes("fast") || m.includes("mini")) return 12;
        if (r.includes("4k") || r.includes("2160")) return 35;
        return 25; // Pro 720p/1080p 默认
      };
      const HARD_LOOKBACK_MIN = 60; // 只看最近 1 小时
      const { data: jobs } = await admin
        .from("marketing_video_jobs")
        .select("id, user_id, status, provider_task_id, parent_job_id, created_at")
        .in("status", ["queued", "running"])
        .gt("created_at", new Date(Date.now() - HARD_LOOKBACK_MIN * 60_000).toISOString())
        .limit(30);

      // 预取关联 asset 的 model/resolution
      const jobIds = (jobs || []).filter((j) => !j.parent_job_id).map((j) => j.id);
      const assetByJob = new Map<string, any>();
      if (jobIds.length > 0) {
        const { data: assets } = await admin
          .from("marketing_assets")
          .select("id, meta")
          .eq("kind", "video")
          .in("meta->>job_id", jobIds);
        for (const a of assets || []) {
          const jid = (a.meta as any)?.job_id;
          if (jid) assetByJob.set(jid, a);
        }
      }

      const results: any[] = [];
      for (const j of jobs || []) {
        const asset = assetByJob.get(j.id);
        const model = asset?.meta?.model as string | undefined;
        const resolution = asset?.meta?.resolution as string | undefined;
        const TIMEOUT_MIN = timeoutMinFor(model, resolution);
        const ageMs = Date.now() - new Date(j.created_at).getTime();
        const overTimeout = ageMs > TIMEOUT_MIN * 60_000;

        if (!j.provider_task_id) {
          // 没有 ark 任务 id,既无法核实又超时 → 失败
          if (overTimeout) {
            const msg = `渲染超过 ${TIMEOUT_MIN} 分钟未完成,已自动结束,请重试`;
            await admin.from("marketing_video_jobs").update({
              status: "failed", error: msg, last_polled_at: new Date().toISOString(),
            }).eq("id", j.id);
            if (!j.parent_job_id) {
              await updateAssetMeta(admin, j.user_id, j.id, { status: "failed", error: msg });
            }
            results.push({ id: j.id, status: "failed", reason: "timeout_no_task" });
          } else {
            results.push({ id: j.id, status: j.status, skipped: "no_provider_task" });
          }
          continue;
        }

        // 始终先去 Ark 查最新状态(也就是"超时前再确认一次")
        const r = await pollOne(ARK_KEY, j.provider_task_id);

        // 如果 Ark 仍在 queued/running 且本地已超阈值,才判超时
        if (overTimeout && (r.mapped === "queued" || r.mapped === "running")) {
          const modelLabel = model || "当前模型";
          const resLabel = resolution || "当前分辨率";
          const msg = `渲染超过 ${TIMEOUT_MIN} 分钟未完成(${modelLabel}/${resLabel}),建议改用 Seedance Fast 或降到 720p 重试`;
          await admin.from("marketing_video_jobs").update({
            status: "failed", error: msg, last_polled_at: new Date().toISOString(),
          }).eq("id", j.id);
          if (!j.parent_job_id) {
            await updateAssetMeta(admin, j.user_id, j.id, { status: "failed", error: msg });
          }
          results.push({ id: j.id, status: "failed", reason: "timeout", timeout_min: TIMEOUT_MIN });
          continue;
        }

        await admin.from("marketing_video_jobs").update({
          status: r.mapped,
          video_url: r.video_url || null,
          segment_url: r.video_url || null,
          error: r.error || null,
          last_polled_at: new Date().toISOString(),
        }).eq("id", j.id);
        if (!j.parent_job_id) {
          await updateAssetMeta(admin, j.user_id, j.id,
            { status: r.mapped, ...(r.error ? { error: r.error } : {}) },
            r.video_url || null,
          );
        }
        results.push({ id: j.id, status: r.mapped });

      }
      return json({ swept: results.length, results });
    }

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body.job_id;
    if (!jobId) return json({ error: "缺少 job_id" }, 400);


    const { data: job, error: jErr } = await admin
      .from("marketing_video_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (jErr || !job) return json({ error: "任务不存在" }, 404);

    const isParent = (job.segment_total ?? 0) > 1 && !job.provider_task_id;

    // ============ 父任务 ============
    if (isParent) {
      // 终态:已经拼好或失败
      if (job.status === "succeeded" || job.status === "failed") {
        return json({
          status: job.status, is_parent: true, video_url: job.video_url, error: job.error,
          segment_total: job.segment_total,
        });
      }

      const { data: children } = await admin
        .from("marketing_video_jobs")
        .select("*")
        .eq("parent_job_id", jobId)
        .order("segment_index", { ascending: true });

      const segs = children || [];
      const segUrls: (string | null)[] = new Array(job.segment_total).fill(null);
      let done = 0;
      let anyFailed: string | null = null;

      for (const ch of segs) {
        let chStatus = ch.status;
        let chUrl = ch.segment_url || ch.video_url;
        let chErr = ch.error;

        if (chStatus !== "succeeded" && chStatus !== "failed" && ch.provider_task_id) {
          const r = await pollOne(ARK_KEY, ch.provider_task_id);
          chStatus = r.mapped;
          chUrl = r.video_url || chUrl;
          chErr = r.error || chErr;
          await admin.from("marketing_video_jobs").update({
            status: chStatus,
            video_url: r.video_url || null,
            segment_url: r.video_url || null,
            error: r.error || null,
            last_polled_at: new Date().toISOString(),
          }).eq("id", ch.id);
        }

        if (chStatus === "succeeded" && chUrl) {
          segUrls[ch.segment_index ?? 0] = chUrl;
          done += 1;
        } else if (chStatus === "failed") {
          anyFailed = chErr || `第 ${(ch.segment_index ?? 0) + 1} 段失败`;
        }
      }

      // 汇总写父任务
      let parentStatus = job.status;
      if (anyFailed) {
        parentStatus = "failed";
        await admin.from("marketing_video_jobs").update({
          status: "failed", error: anyFailed, last_polled_at: new Date().toISOString(),
        }).eq("id", jobId);
        await updateAssetMeta(admin, u.user.id, jobId, { status: "failed", error: anyFailed, segment_done: done });
      } else if (done === job.segment_total) {
        // 所有段就绪,等客户端拼接
        parentStatus = "ready_to_stitch";
        await admin.from("marketing_video_jobs").update({
          status: "ready_to_stitch", last_polled_at: new Date().toISOString(),
        }).eq("id", jobId);
        await updateAssetMeta(admin, u.user.id, jobId, {
          status: "stitching", stage: "stitching", segment_done: done, segment_urls: segUrls,
        });
      } else {
        parentStatus = "running";
        await admin.from("marketing_video_jobs").update({
          status: "running", last_polled_at: new Date().toISOString(),
        }).eq("id", jobId);
        await updateAssetMeta(admin, u.user.id, jobId, {
          status: "running", stage: "generating", segment_done: done,
        });
      }

      return json({
        status: parentStatus, is_parent: true,
          segment_total: job.segment_total, segment_done: done,
          segment_urls: segUrls.map((u) => u ? encodeSegmentUrl(u) : null), error: anyFailed,
      });
    }

    // ============ 单段任务(或子段) ============
    if (job.status === "succeeded" || job.status === "failed") {
      return json({ status: job.status, video_url: job.video_url, error: job.error });
    }
    if (!job.provider_task_id) {
      return json({ status: job.status });
    }

    const r = await pollOne(ARK_KEY, job.provider_task_id);
    await admin.from("marketing_video_jobs").update({
      status: r.mapped,
      video_url: r.video_url || null,
      segment_url: r.video_url || null,
      error: r.error || null,
      last_polled_at: new Date().toISOString(),
    }).eq("id", jobId);

    // 只有单段任务才同步素材库(子段不应在素材库出现)
    if (!job.parent_job_id) {
      await updateAssetMeta(admin, u.user.id, jobId,
        { status: r.mapped, ...(r.error ? { error: r.error } : {}) },
        r.video_url || null,
      );
    }

    return json({ status: r.mapped, video_url: r.video_url || null, error: r.error || null, ark_status: r.status });
  } catch (e) {
    console.error("[poll] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

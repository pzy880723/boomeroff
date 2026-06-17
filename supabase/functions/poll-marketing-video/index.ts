// 轮询火山方舟 Seedance 任务状态;成功后把 video_url 回写到 marketing_video_jobs 和 marketing_assets。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ARK_TASK_BASE = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ error: "未配置 ARK_API_KEY" }, 500);

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body.job_id;
    if (!jobId) return json({ error: "缺少 job_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job, error: jErr } = await admin
      .from("marketing_video_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (jErr || !job) return json({ error: "任务不存在" }, 404);

    // 已是终态直接返回
    if (job.status === "succeeded" || job.status === "failed") {
      return json({ status: job.status, video_url: job.video_url, error: job.error });
    }
    if (!job.provider_task_id) {
      return json({ status: job.status });
    }

    const arkRes = await fetch(`${ARK_TASK_BASE}/${job.provider_task_id}`, {
      headers: { "Authorization": `Bearer ${ARK_KEY}` },
    });
    const arkJson: any = await arkRes.json().catch(() => ({}));
    if (!arkRes.ok) {
      console.error("[poll] ark error", arkRes.status, arkJson);
      return json({ error: arkJson?.error?.message || `查询失败(${arkRes.status})` }, 502);
    }

    const status: string = arkJson.status || "running";
    const videoUrl: string | undefined = arkJson?.content?.video_url || arkJson?.video_url;
    const errMsg: string | undefined = arkJson?.error?.message;

    let mappedStatus = "running";
    if (status === "succeeded") mappedStatus = "succeeded";
    else if (status === "failed" || status === "expired" || status === "cancelled") mappedStatus = "failed";
    else if (status === "queued") mappedStatus = "queued";

    await admin.from("marketing_video_jobs").update({
      status: mappedStatus,
      video_url: videoUrl || null,
      error: errMsg || null,
      last_polled_at: new Date().toISOString(),
    }).eq("id", jobId);

    // 同步素材库
    const { data: asset } = await admin
      .from("marketing_assets")
      .select("id, meta")
      .eq("user_id", u.user.id)
      .eq("kind", "video")
      .filter("meta->>job_id", "eq", jobId)
      .maybeSingle();
    if (asset) {
      const newMeta = { ...(asset.meta || {}), status: mappedStatus };
      if (errMsg) newMeta.error = errMsg;
      await admin.from("marketing_assets").update({
        output_url: videoUrl || null,
        meta: newMeta,
      }).eq("id", asset.id);
    }

    return json({ status: mappedStatus, video_url: videoUrl || null, error: errMsg || null, ark_status: status });
  } catch (e) {
    console.error("[poll] error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

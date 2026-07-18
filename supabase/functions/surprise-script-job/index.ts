// 惊喜一下脚本草稿任务。
// 只负责“抽素材 + 生成脚本 + 保存草稿”，不创建视频镜头；用户确认后由 director-create-job 消费。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { validateSurpriseScript } from "../_shared/surprise-script-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type AdminClient = ReturnType<typeof createClient>;

function state(job: any) {
  const source = (job?.source_pick_json || {}) as any;
  return {
    ok: true,
    job_id: job.id,
    status: job.status,
    stage: job.meta?.surprise_stage || job.status,
    script: job.script_json || null,
    result: source.surprise_result || null,
    error: job.error_message || null,
    updated_at: job.updated_at,
  };
}

async function getUser(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data } = await userClient.auth.getUser();
  return data.user || null;
}

async function findDraft(admin: AdminClient, userId: string, shopId: string) {
  const { data, error } = await admin
    .from("video_generation_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []).find((job: any) =>
    job?.meta?.surprise_stage === "script_generating" || job?.meta?.surprise_stage === "script_ready"
  ) || null;
}

async function runScriptGeneration({
  admin,
  supabaseUrl,
  auth,
  jobId,
  shopId,
  exclude,
  realism,
}: {
  admin: AdminClient;
  supabaseUrl: string;
  auth: string;
  jobId: string;
  shopId: string;
  exclude: string[];
  realism: string;
}) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/surprise-marketing-video`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ shop_id: shopId, preview: true, exclude_asset_ids: exclude, realism }),
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false || !result?.script) {
      throw new Error(result?.error || `脚本生成失败(${response.status})`);
    }
    const validation = validateSurpriseScript(result.script, {
      ageBucket: result.persona?.age_bucket || null,
      factContext: JSON.stringify({
        assets: result.assets || [],
        picked: result.picked || null,
        persona: result.persona || null,
      }),
    });
    if (validation.errors.length) {
      throw new Error(`脚本校验未通过: ${validation.errors.join("；")}`);
    }
    const { data: savedJob, error: saveError } = await admin.from("video_generation_jobs").update({
      script_json: result.script,
      source_pick_json: {
        surprise_result: result,
        picked_assets: result.assets || [],
        persona: result.persona || null,
        style: result.style || "energetic",
        excluded_asset_ids: exclude,
      },
      user_prompt: result.picked?.summary || result.script?.title || "BOOMER 探店短片",
      status: "script_ready",
      error_message: null,
      meta: {
        flow: "surprise",
        consumed: false,
        surprise_stage: "script_ready",
        background: true,
        script_provider: result.script?.script_provider || null,
      },
    }).eq("id", jobId).eq("status", "script_generating").select("id").maybeSingle();
    if (saveError) throw saveError;
    // 用户可能已经手工保存或放弃了草稿，后台结果不能覆盖新的状态。
    if (!savedJob) return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("video_generation_jobs").update({
      status: "failed",
      error_message: message.slice(0, 1000),
      meta: { flow: "surprise", consumed: false, surprise_stage: "failed", background: true },
    }).eq("id", jobId).eq("status", "script_generating");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization");
    const user = await getUser(req, supabaseUrl, anonKey);
    if (!user || !auth) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "start");
    const shopId = String(body.shop_id || "").trim();
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (action === "start") {
      if (!shopId) return json({ ok: false, error: "缺少 shop_id" }, 400);
      const existing = await findDraft(admin, user.id, shopId);
      if (existing) return json(state(existing));

      const exclude = Array.isArray(body.exclude_asset_ids)
        ? body.exclude_asset_ids.map((x: unknown) => String(x)).slice(0, 50)
        : [];
      const realism = body.realism === "photoreal" ? "photoreal" : "stylized";
      const { data: job, error } = await admin.from("video_generation_jobs").insert({
        user_id: user.id,
        shop_id: shopId,
        user_prompt: "BOOMER 惊喜一下脚本草稿",
        source_pick_json: { excluded_asset_ids: exclude },
        script_json: null,
        status: "script_generating",
        duration: 15,
        aspect_ratio: "9:16",
        meta: { flow: "surprise", consumed: false, surprise_stage: "script_generating", background: true },
      }).select("*").single();
      if (error || !job) return json({ ok: false, error: `创建脚本任务失败: ${error?.message || "unknown"}` }, 500);

      const task = runScriptGeneration({ admin, supabaseUrl, auth, jobId: job.id, shopId, exclude, realism });
      // @ts-ignore Supabase Edge Runtime extension
      if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
        (globalThis as any).EdgeRuntime.waitUntil(task);
      } else {
        await task;
      }
      return json(state(job), 202);
    }

    const jobId = String(body.job_id || "").trim();
    if (!jobId) return json({ ok: false, error: "缺少 job_id" }, 400);
    const { data: job, error: jobError } = await admin
      .from("video_generation_jobs").select("*").eq("id", jobId).eq("user_id", user.id).single();
    if (jobError || !job) return json({ ok: false, error: "脚本任务不存在" }, 404);

    if (action === "poll") return json(state(job));

    if (action === "save") {
      if (!['script_generating', 'script_ready'].includes(String(job.status))) {
        return json({ ok: false, error: "脚本已经进入视频生成，不能再修改" }, 409);
      }
      const script = body.script && typeof body.script === "object" ? body.script : null;
      if (!script) return json({ ok: false, error: "缺少脚本" }, 400);
      const validation = validateSurpriseScript(script, {
        factContext: JSON.stringify(job.source_pick_json || {}),
      });
      if (validation.errors.length) return json({ ok: false, error: validation.errors.join("；"), errors: validation.errors }, 422);
      const { data: saved, error } = await admin.from("video_generation_jobs").update({
        script_json: script,
        status: "script_ready",
        error_message: null,
        meta: {
          ...(job.meta || {}),
          flow: "surprise",
          consumed: false,
          surprise_stage: "script_ready",
          manually_edited_at: new Date().toISOString(),
        },
      }).eq("id", jobId).select("*").single();
      if (error || !saved) return json({ ok: false, error: error?.message || "保存脚本失败" }, 500);
      return json(state(saved));
    }

    if (action === "discard") {
      if (String(job.status) !== "script_ready" && String(job.status) !== "script_generating") {
        return json({ ok: false, error: "任务已进入视频生成，不能丢弃" }, 409);
      }
      const { count } = await admin.from("video_generation_shots").select("id", { count: "exact", head: true }).eq("job_id", jobId);
      if (count) return json({ ok: false, error: "任务已经有视频镜头，不能丢弃" }, 409);
      await admin.from("video_generation_jobs").delete().eq("id", jobId);
      return json({ ok: true, discarded: true });
    }

    return json({ ok: false, error: "不支持的操作" }, 400);
  } catch (error) {
    console.error("[surprise-script-job] fatal", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

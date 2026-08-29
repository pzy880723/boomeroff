// 惊喜一下脚本草稿任务。
// 只负责“抽素材 + 生成脚本 + 保存草稿”，不创建视频镜头；用户确认后由 director-create-job 消费。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertStoreAccess, resolveAuthorizedShop, StoreAccessError } from "../_shared/store-access.ts";
import { validateSurpriseScript } from "../_shared/surprise-script-policy.ts";
import {
  isStaleSurpriseScriptTask,
  selectCurrentSurpriseTask,
  type SurpriseTaskRow,
} from "../_shared/surprise-task-state.ts";

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
    task_kind: "script",
    job_id: job.id,
    status: job.status,
    stage: job.meta?.surprise_stage || job.status,
    script: job.script_json || null,
    result: source.surprise_result || null,
    error: job.error_message || null,
    updated_at: job.updated_at,
  };
}

function videoState(job: any) {
  return {
    ok: true,
    task_kind: "video",
    job_id: job.id,
    status: job.status,
    stage: job.meta?.surprise_stage || job.status,
    final_video_url: job.final_video_url || null,
    cover_url: job.cover_url || null,
    created_at: job.created_at,
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

async function findCurrentTask(admin: AdminClient, userId: string, shopId: string) {
  const { data, error } = await admin
    .from("video_generation_jobs")
    .select("*")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return selectCurrentSurpriseTask((data || []) as SurpriseTaskRow[]);
}

async function clearFailedDrafts(admin: AdminClient, userId: string, shopId: string) {
  const { error } = await admin
    .from("video_generation_jobs")
    .delete()
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("status", "failed")
    .contains("meta", { flow: "surprise", consumed: false });
  if (error) throw error;
}

async function expireStaleGeneratingDrafts(admin: AdminClient, userId: string, shopId: string) {
  const cutoff = new Date(Date.now() - 40_000).toISOString();
  const { error } = await admin
    .from("video_generation_jobs")
    .update({
      status: "failed",
      error_message: "脚本生成超时，系统已自动结束旧任务，请重新进入生成",
      meta: { flow: "surprise", consumed: false, surprise_stage: "failed", background: true, stale: true },
    })
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .eq("status", "script_generating")
    .lt("updated_at", cutoff)
    .contains("meta", { flow: "surprise", consumed: false });
  if (error) throw error;
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
  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/functions/v1/surprise-marketing-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        signal: controller.signal,
        body: JSON.stringify({ shop_id: shopId, preview: true, exclude_asset_ids: exclude, realism }),
      });
    } finally {
      clearTimeout(timer);
    }
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
        script_provider_model: result.script?.script_provider_model || null,
        script_provider_reason: result.script?.script_provider_reason || null,
        script_generation_ms: Date.now() - startedAt,
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
      meta: {
        flow: "surprise",
        consumed: false,
        surprise_stage: "failed",
        background: true,
        script_generation_ms: Date.now() - startedAt,
      },
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
    let shopId = String(body.shop_id || "").trim();
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (action === "start") {
      shopId = (await resolveAuthorizedShop(admin, user.id, shopId || null)) || "";
      if (!shopId) return json({ ok: false, error: "缺少 shop_id" }, 400);
      await expireStaleGeneratingDrafts(admin, user.id, shopId);
      const current = await findCurrentTask(admin, user.id, shopId);
      if (current?.kind === "script") return json(state(current.job));
      if (current?.kind === "video") return json(videoState(current.job));
      // 失败记录没有可恢复的脚本，不能在用户下次进入时永久占住当前任务。
      await clearFailedDrafts(admin, user.id, shopId);

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
    await assertStoreAccess(admin, user.id, job.shop_id);

    if (action === "poll") {
      if (isStaleSurpriseScriptTask(job)) {
        const staleJob = {
          ...job,
          status: "failed",
          error_message: "脚本生成超时，系统已自动结束旧任务，请重新进入生成",
          meta: { flow: "surprise", consumed: false, surprise_stage: "failed", background: true, stale: true },
        };
        await admin.from("video_generation_jobs").update({
          status: staleJob.status,
          error_message: staleJob.error_message,
          meta: staleJob.meta,
        }).eq("id", job.id).eq("status", "script_generating");
        return json(state(staleJob));
      }
      const meta = (job.meta || {}) as Record<string, unknown>;
      return json(meta.flow === "surprise" && meta.consumed === true ? videoState(job) : state(job));
    }

    if (action === "dismiss") {
      const meta = (job.meta || {}) as Record<string, unknown>;
      if (meta.flow !== "surprise" || meta.consumed !== true) {
        return json({ ok: false, error: "当前任务不是已生成的视频任务" }, 409);
      }
      const { error } = await admin.from("video_generation_jobs").update({
        meta: {
          ...meta,
          surprise_dismissed_at: new Date().toISOString(),
        },
      }).eq("id", jobId);
      if (error) return json({ ok: false, error: error.message || "结束任务失败" }, 500);
      return json({ ok: true, dismissed: true, job_id: jobId });
    }

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
      if (!["script_ready", "script_generating", "failed"].includes(String(job.status))) {
        return json({ ok: false, error: "任务已进入视频生成，不能丢弃" }, 409);
      }
      const { count } = await admin.from("video_generation_shots").select("id", { count: "exact", head: true }).eq("job_id", jobId);
      if (count) return json({ ok: false, error: "任务已经有视频镜头，不能丢弃" }, 409);
      const deleteQuery = admin.from("video_generation_jobs").delete();
      const { error: deleteError } = String(job.status) === "failed"
        ? await deleteQuery
          .eq("user_id", user.id)
          .eq("shop_id", job.shop_id)
          .eq("status", "failed")
          .contains("meta", { flow: "surprise" })
        : await deleteQuery.eq("id", jobId);
      if (deleteError) return json({ ok: false, error: deleteError.message || "清理旧脚本失败" }, 500);
      return json({ ok: true, discarded: true });
    }

    return json({ ok: false, error: "不支持的操作" }, 400);
  } catch (error) {
    console.error("[surprise-script-job] fatal", error);
    const status = error instanceof StoreAccessError ? error.status : 500;
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, status);
  }
});

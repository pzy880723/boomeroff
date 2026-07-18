// director-create-job:
// 前端在「惊喜一下」确认时调用。落一个 video_generation_jobs + 对应 shots,
// 然后异步触发 director-run-pipeline 去跑真正的流水线。返回 job_id 立刻给前端做进度轮询。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildDirectorShotPlan, type DirectorScript } from "../_shared/director-utils.ts";
import { validateSurpriseScript } from "../_shared/surprise-script-policy.ts";

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
    const shopId: string | null = typeof body.shop_id === 'string' && body.shop_id ? body.shop_id : null;
    const script: DirectorScript | null = body.script && typeof body.script === 'object' ? body.script : null;
    const pickedAssets: unknown[] = Array.isArray(body.picked_assets) ? body.picked_assets : [];
    const persona = body.persona && typeof body.persona === 'object' ? body.persona : null;
    const modelId: string | undefined = typeof body.model === 'string' ? body.model : undefined;
    const resolution: string | undefined = typeof body.resolution === 'string' ? body.resolution : undefined;
    const style: string | undefined = typeof body.style === 'string' ? body.style : undefined;
    const promptOverrides = body.prompt_overrides && typeof body.prompt_overrides === 'object' ? body.prompt_overrides : null;
    const draftJobId: string | null = typeof body.draft_job_id === 'string' && body.draft_job_id
      ? body.draft_job_id : null;
    const userPrompt: string | null = typeof body.user_prompt === 'string' && body.user_prompt.trim()
      ? body.user_prompt.trim().slice(0, 500)
      : (typeof script?.title === 'string' ? String(script.title).slice(0, 500) : null);
    if (!shopId) return json({ ok: false, error: "缺少 shop_id" });
    if (!script) return json({ ok: false, error: "缺少脚本" });

    if (draftJobId) {
      const scriptValidation = validateSurpriseScript(script, { factContext: JSON.stringify(pickedAssets) });
      if (scriptValidation.errors.length) {
        return json({ ok: false, error: `脚本未通过校验: ${scriptValidation.errors.join("；")}`, errors: scriptValidation.errors }, 422);
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const brief = {
      goal: '门店探店 · 高转化短视频',
      platform: '通用短视频',
      duration_s: 15,
      aspect_ratio: '9:16',
      style: '复古生活方式 · BOOMER-OFF',
    };

    const shotPlan = buildDirectorShotPlan(script);
    const plannedDuration = shotPlan.reduce((sum, shot) => sum + shot.duration, 0);
    if (shotPlan.length !== 3 || plannedDuration !== 15) {
      return json({ ok: false, error: `导演分镜计划异常:${shotPlan.length} 镜 / ${plannedDuration} 秒` }, 422);
    }

    // 1) 新建视频任务,或把已保存的惊喜脚本草稿升级成视频任务。
    let job: any = null;
    let jErr: any = null;
    if (draftJobId) {
      const existing = await admin.from("video_generation_jobs")
        .select("*")
        .eq("id", draftJobId)
        .eq("user_id", u.user.id)
        .eq("shop_id", shopId)
        .single();
      if (existing.error || !existing.data) {
        return json({ ok: false, error: '脚本草稿不存在或无权访问' }, 404);
      }
      const draftStage = existing.data?.meta?.surprise_stage;
      if (!['script_generating', 'script_ready'].includes(String(existing.data.status)) || draftStage !== 'script_ready') {
        return json({ ok: false, error: '脚本还未准备好，无法开始生成视频' }, 409);
      }
      const existingShots = await admin.from("video_generation_shots")
        .select("id", { count: "exact", head: true }).eq("job_id", draftJobId);
      if (existingShots.count) return json({ ok: false, error: '该脚本已经开始生成视频' }, 409);

      const updated = await admin.from("video_generation_jobs").update({
        user_prompt: userPrompt,
        source_pick_json: { picked_assets: pickedAssets, persona, model: modelId, resolution, style, prompt_overrides: promptOverrides },
        brief_json: brief,
        script_json: script,
        status: 'queued',
        duration: plannedDuration,
        aspect_ratio: '9:16',
        error_message: null,
        meta: {
          ...(existing.data.meta || {}),
          flow: 'surprise',
          consumed: true,
          surprise_stage: 'video_queued',
          pipeline_version: 'director-v2',
          planned_shot_count: shotPlan.length,
          publish_copy_status: 'pending',
          background: true,
          draft_consumed_at: new Date().toISOString(),
        },
      }).eq("id", draftJobId).select().single();
      job = updated.data;
      jErr = updated.error;
    } else {
      const inserted = await admin
        .from("video_generation_jobs")
        .insert({
          user_id: u.user.id,
          shop_id: shopId,
          user_prompt: userPrompt,
          source_pick_json: { picked_assets: pickedAssets, persona, model: modelId, resolution, style, prompt_overrides: promptOverrides },
          brief_json: brief,
          script_json: script,
          status: 'queued',
          duration: plannedDuration,
          aspect_ratio: '9:16',
          meta: {
            pipeline_version: 'director-v2',
            planned_shot_count: shotPlan.length,
            publish_copy_status: 'pending',
            background: true,
          },
        })
        .select()
        .single();
      job = inserted.data;
      jErr = inserted.error;
    }
    if (jErr || !job) return json({ ok: false, error: '建任务失败: ' + (jErr?.message || 'unknown') }, 500);

    // 2) insert shots
    const shotRows = shotPlan.map((s, i) => ({
      job_id: job.id,
      shot_index: i,
      duration: s.duration,
      scene: s.scene || null,
      subject: s.subject || null,
      action: s.action || null,
      camera: s.camera || null,
      subtitle: s.subtitle || null,
      dialogue: s.dialogue || null,
      prompt: s.prompt,
      status: 'pending',
      meta: {
        pipeline_version: 'director-v2',
        source_labels: s.sourceLabels,
        image_indices: s.imageIndices,
      },
    }));
    const { error: sErr } = await admin.from("video_generation_shots").insert(shotRows);
    if (sErr) {
      console.error("[director-create-job] shots insert", sErr);
      if (draftJobId) {
        await admin.from("video_generation_jobs").update({
          status: 'failed',
          error_message: '创建分镜失败: ' + sErr.message,
          meta: { ...(job.meta || {}), surprise_stage: 'failed' },
        }).eq("id", job.id);
      } else {
        await admin.from("video_generation_jobs").delete().eq("id", job.id);
      }
      return json({ ok: false, error: '创建分镜失败:' + sErr.message }, 500);
    }

    // 3) 异步触发 pipeline,交给 EdgeRuntime 托管,避免响应返回后请求被中止。
    const pipelineRequest = fetch(`${SUPABASE_URL}/functions/v1/director-run-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ job_id: job.id }),
    }).then(async (response) => {
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        await updatePipelineStartFailure(admin, job.id, `导演流水线启动失败(${response.status}):${detail.slice(0, 180)}`);
      }
    }).catch(async (e) => {
      console.warn("[director-create-job] pipeline fire failed", e);
      await updatePipelineStartFailure(admin, job.id, `导演流水线启动失败:${(e as Error).message || String(e)}`);
    });
    // @ts-ignore Supabase Edge Runtime extension
    if (typeof (globalThis as any).EdgeRuntime?.waitUntil === 'function') {
      (globalThis as any).EdgeRuntime.waitUntil(pipelineRequest);
    } else {
      await pipelineRequest;
    }

    return json({ ok: true, job_id: job.id, shot_count: shotRows.length }, 202);
  } catch (e) {
    console.error("[director-create-job] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

async function updatePipelineStartFailure(admin: any, jobId: string, message: string) {
  await admin.from('video_generation_jobs').update({ status: 'failed', error_message: message }).eq('id', jobId);
}

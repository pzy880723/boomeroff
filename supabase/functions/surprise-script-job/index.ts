// “BOOMER 帮我拍”脚本草稿任务。
// 只负责抽素材、生成/修改脚本和保存参考图；用户确认后提交同一份脚本给 15 秒 one-shot 渲染。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertStoreAccess, resolveAuthorizedShop, StoreAccessError } from "../_shared/store-access.ts";
import { validateSurpriseScript } from "../_shared/surprise-script-policy.ts";
import { formatPersonaDirective, type InfluencerPersona } from "../_shared/persona-generator.ts";
import {
  bindSurpriseReferences,
  normalizeSurpriseScript,
  type SurpriseReferenceDescription,
  type SurpriseScript,
} from "../_shared/surprise-one-shot.ts";
import {
  appendSurpriseConversation,
  appendSurpriseScriptVersion,
  normalizeSurprisePersonaRevision,
  orderSurpriseReferenceAssets,
} from "../_shared/surprise-script-revision.ts";
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
    script: source.manual_script_draft || job.script_json || null,
    result: source.surprise_result || null,
    conversation: source.surprise_conversation || [],
    picked_assets: source.picked_assets || source.surprise_result?.assets || [],
    script_versions: job.meta?.script_versions || [],
    error: job.error_message || null,
    updated_at: job.updated_at,
  };
}

function referenceDescriptions(assets: any[]): SurpriseReferenceDescription[] {
  return assets.map((asset, index) => ({
    index,
    summary: String(asset?.summary || asset?.category || (index === 0 ? "当前门店真实门头" : "当前门店真实实景")),
    role: asset?.role === "storefront" ? "storefront" : "scene",
  }));
}

function parseAiJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 没有返回可用脚本");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function reviseScriptWithAi(
  apiKey: string,
  instruction: string,
  currentScript: SurpriseScript,
  source: Record<string, any>,
): Promise<{ script: SurpriseScript; summary: string; persona: InfluencerPersona }> {
  const assets = Array.isArray(source.picked_assets) ? source.picked_assets : [];
  const persona = source.persona || source.surprise_result?.persona || null;
  const prompt = `你是 BOOMER·OFF 中古杂货店 15 秒探店视频脚本编辑器。\n\n` +
    `店员修改要求：${instruction}\n\n` +
    `当前人物：${JSON.stringify(persona)}\n` +
    `当前真实参考图：${JSON.stringify(assets.map((asset: any, index: number) => ({ index, summary: asset.summary, role: asset.role })))}\n` +
    `当前脚本：${JSON.stringify(currentScript)}\n\n` +
    `只输出 JSON：{"script":完整脚本对象,"persona":完整人物对象,"summary":"一句话说明改了什么"}。` +
    `如果修改要求没有涉及人物，persona 必须逐项保持当前人物；如果涉及人物，则同步修改年龄、性别、外观、气质和语速。` +
    `脚本必须恰好五段 hook + scenes三段 + outro，每段都有 scene/action/dialogue/subtitle/duration_s/image_index/motion；` +
    `每段 dialogue 必须 18-21 个汉字，五段合计 90-100 个汉字，subtitle 必须逐字等于 dialogue，` +
    `continuous_dialogue 必须是五段 dialogue 用中文逗号连接；动作必须明确人物边行动边连续说话，不能停顿；` +
    `第一段必须严格使用 index=0 的真实门头参考图，不得重画或改造 Logo；其余画面只能使用上面的真实参考图；` +
    `不得编造价格、活动、地址或门店事实，不得复用六个字以上的重复短语。`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(response.status === 429 ? "AI 正忙，请稍后再改" : `AI 改稿失败(${response.status}): ${text.slice(0, 120)}`);
  }
  const data = await response.json();
  const parsed = parseAiJson(String(data?.choices?.[0]?.message?.content || ""));
  const personaChangeRequested = /(人物|角色|主角|博主|女生|男生|男性|女性|老人|年轻|中年|年龄|情侣|一家三口)/.test(instruction);
  const persona = normalizeSurprisePersonaRevision(
    source.persona || source.surprise_result?.persona,
    personaChangeRequested ? parsed.persona : (source.persona || source.surprise_result?.persona),
  ) as InfluencerPersona;
  const descriptions = referenceDescriptions(assets);
  const script = bindSurpriseReferences(
    normalizeSurpriseScript((parsed.script || parsed) as SurpriseScript),
    assets.length,
    descriptions,
  );
  const validation = validateSurpriseScript(script, { ageBucket: persona.age_bucket || null, factContext: JSON.stringify(source) });
  if (validation.errors.length) throw new Error(`改稿后校验未通过：${validation.errors.join("；")}`);
  return { script, persona, summary: String(parsed.summary || "已经按你的要求更新脚本").slice(0, 200) };
}

function videoState(job: any) {
  const renderJobId = job.meta?.render_job_id || null;
  return {
    ok: true,
    task_kind: "video",
    job_id: renderJobId || job.id,
    render_job_id: renderJobId,
    status: renderJobId ? "queued" : job.status,
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
  const cutoff = new Date(Date.now() - 70_000).toISOString();
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
        script_versions: appendSurpriseScriptVersion([], result.script, "generated"),
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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY") || "";
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
      if (error?.code === '23505') {
        const concurrent = await findCurrentTask(admin, user.id, shopId);
        if (concurrent?.kind === 'script') return json(state(concurrent.job));
        if (concurrent?.kind === 'video') return json(videoState(concurrent.job));
      }
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
    let { data: job, error: jobError } = await admin
      .from("video_generation_jobs").select("*").eq("id", jobId).eq("user_id", user.id).single();
    if ((!job || jobError) && action === "dismiss") {
      const fallback = await admin.from("video_generation_jobs")
        .select("*")
        .eq("user_id", user.id)
        .contains("meta", { render_job_id: jobId })
        .maybeSingle();
      job = fallback.data;
      jobError = fallback.error;
    }
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
      }).eq("id", job.id);
      if (error) return json({ ok: false, error: error.message || "结束任务失败" }, 500);
      return json({ ok: true, dismissed: true, job_id: jobId });
    }

    if (action === "save_draft") {
      if (String(job.status) !== "script_ready") {
        return json({ ok: false, error: "脚本还没有准备好" }, 409);
      }
      const script = body.script && typeof body.script === "object" ? body.script : null;
      if (!script) return json({ ok: false, error: "缺少脚本" }, 400);
      const source = (job.source_pick_json || {}) as Record<string, unknown>;
      const { data: saved, error } = await admin.from("video_generation_jobs").update({
        source_pick_json: { ...source, manual_script_draft: script },
      }).eq("id", job.id).eq("status", "script_ready").contains("meta", { flow: "surprise", consumed: false }).select("*").single();
      if (error || !saved) return json({ ok: false, error: error?.message || "保存脚本草稿失败" }, 500);
      return json(state(saved));
    }

    if (action === "save") {
      if (!['script_generating', 'script_ready'].includes(String(job.status))) {
        return json({ ok: false, error: "脚本已经进入视频生成，不能再修改" }, 409);
      }
      const submittedScript = body.script && typeof body.script === "object" ? body.script : null;
      if (!submittedScript) return json({ ok: false, error: "缺少脚本" }, 400);
      const source = (job.source_pick_json || {}) as Record<string, any>;
      const assets = Array.isArray(source.picked_assets) ? source.picked_assets : [];
      const script = bindSurpriseReferences(
        normalizeSurpriseScript(submittedScript as SurpriseScript),
        assets.length,
        referenceDescriptions(assets),
      );
      const validation = validateSurpriseScript(script, {
        factContext: JSON.stringify(job.source_pick_json || {}),
      });
      if (validation.errors.length) return json({ ok: false, error: validation.errors.join("；"), errors: validation.errors }, 422);
      const nextSource = { ...source };
      delete nextSource.manual_script_draft;
      const { data: saved, error } = await admin.from("video_generation_jobs").update({
        script_json: script,
        source_pick_json: nextSource,
        status: "script_ready",
        error_message: null,
        meta: {
          ...(job.meta || {}),
          flow: "surprise",
          consumed: false,
          surprise_stage: "script_ready",
          manually_edited_at: new Date().toISOString(),
          script_versions: appendSurpriseScriptVersion(job.meta?.script_versions, script, "manual"),
        },
      }).eq("id", jobId).eq("status", "script_ready").contains("meta", { flow: "surprise", consumed: false }).select("*").single();
      if (error || !saved) return json({ ok: false, error: error?.message || "保存脚本失败" }, 500);
      return json(state(saved));
    }

    if (action === "revise") {
      if (String(job.status) !== "script_ready" || !job.script_json) {
        return json({ ok: false, error: "脚本还没有准备好" }, 409);
      }
      const instruction = String(body.instruction || "").trim();
      if (!instruction) return json({ ok: false, error: "请告诉 BOOMER 想怎么修改" }, 400);
      if (!lovableApiKey) return json({ ok: false, error: "AI 改稿服务尚未配置" }, 503);
      const source = (job.source_pick_json || {}) as Record<string, any>;
      const revised = await reviseScriptWithAi(lovableApiKey, instruction.slice(0, 500), job.script_json, source);
      const previousResult = source.surprise_result && typeof source.surprise_result === "object"
        ? source.surprise_result
        : {};
      const previousOverrides = previousResult.prompt_overrides && typeof previousResult.prompt_overrides === "object"
        ? previousResult.prompt_overrides
        : {};
      const nextSource = {
        ...source,
        manual_script_draft: null,
        persona: revised.persona,
        surprise_result: {
          ...previousResult,
          script: revised.script,
          persona: revised.persona,
          prompt_overrides: {
            ...previousOverrides,
            persona_directive: formatPersonaDirective(revised.persona),
          },
        },
        surprise_conversation: appendSurpriseConversation(
          source.surprise_conversation,
          instruction,
          revised.summary,
        ),
      };
      const { data: saved, error } = await admin.from("video_generation_jobs").update({
        script_json: revised.script,
        source_pick_json: nextSource,
        error_message: null,
        meta: {
          ...(job.meta || {}),
          flow: "surprise",
          consumed: false,
          surprise_stage: "script_ready",
          revised_at: new Date().toISOString(),
          script_versions: appendSurpriseScriptVersion(job.meta?.script_versions, revised.script, "conversation", instruction),
        },
      }).eq("id", jobId).eq("status", "script_ready").contains("meta", { flow: "surprise", consumed: false }).select("*").single();
      if (error || !saved) return json({ ok: false, error: error?.message || "保存改稿失败" }, 500);
      return json(state(saved));
    }

    if (action === "update_assets") {
      if (String(job.status) !== "script_ready" || !job.script_json) {
        return json({ ok: false, error: "脚本还没有准备好" }, 409);
      }
      const urls = Array.isArray(body.asset_urls)
        ? body.asset_urls.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 8)
        : [];
      if (!urls.length) return json({ ok: false, error: "请至少选择一张店内实景图" }, 400);
      const { data: selected, error: selectedError } = await admin
        .from("marketing_assets")
        .select("id, output_url, description, category, tags, meta")
        .eq("shop_id", job.shop_id)
        .eq("kind", "photo")
        .in("output_url", urls);
      if (selectedError) return json({ ok: false, error: selectedError.message || "读取参考图失败" }, 500);
      const selectedByUrl = new Map((selected || []).map((row: any) => [row.output_url, row]));
      const orderedRows = urls.map((url: string) => selectedByUrl.get(url)).filter(Boolean) as Record<string, unknown>[];
      if (orderedRows.length !== urls.length) return json({ ok: false, error: "部分参考图不属于当前门店" }, 403);

      const source = (job.source_pick_json || {}) as Record<string, any>;
      const existingAssets = Array.isArray(source.picked_assets) ? source.picked_assets : [];
      const storefront = existingAssets.find((asset: any) => asset?.role === "storefront") || null;
      const assets = orderSurpriseReferenceAssets(storefront, orderedRows);
      const descriptions = referenceDescriptions(assets);
      const script = bindSurpriseReferences(normalizeSurpriseScript(job.script_json), assets.length, descriptions);
      const result = source.surprise_result && typeof source.surprise_result === "object"
        ? { ...source.surprise_result, assets, script }
        : source.surprise_result;
      const nextSource = { ...source, picked_assets: assets, surprise_result: result };
      const { data: saved, error } = await admin.from("video_generation_jobs").update({
        script_json: script,
        source_pick_json: nextSource,
        meta: {
          ...(job.meta || {}),
          reference_assets_updated_at: new Date().toISOString(),
          script_versions: appendSurpriseScriptVersion(job.meta?.script_versions, script, "references"),
        },
      }).eq("id", jobId).eq("status", "script_ready").contains("meta", { flow: "surprise", consumed: false }).select("*").single();
      if (error || !saved) return json({ ok: false, error: error?.message || "保存参考图失败" }, 500);
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

// director-retry-shot:重置一个失败的镜头,重新提交给 Seedance。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { submitSeedanceSegment } from "../_shared/seedance-submit.ts";
import { resolveSeedanceModel, clampResolution, DEFAULT_SEEDANCE_2 } from "../_shared/seedance-models.ts";

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
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ ok: false, error: "缺少 ARK_API_KEY" }, 500);

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ ok: false, error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const jobId = body.job_id;
    const shotIndex = Number(body.shot_index);
    if (!jobId || Number.isNaN(shotIndex)) return json({ ok: false, error: "参数缺失" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (!job || job.user_id !== u.user.id) return json({ ok: false, error: "任务不存在" }, 404);
    const { data: shot } = await admin.from("video_generation_shots")
      .select("*").eq("job_id", jobId).eq("shot_index", shotIndex).single();
    if (!shot) return json({ ok: false, error: "镜头不存在" }, 404);

    const src = (job.source_pick_json || {}) as any;
    const modelInfo = resolveSeedanceModel(src.model || DEFAULT_SEEDANCE_2);
    const resolution = clampResolution(modelInfo, src.resolution || modelInfo.default_resolution);
    const characterRefUrl: string | null = (job.character_json as any)?.reference_image_url || null;
    const pickedAssets: any[] = Array.isArray(src.picked_assets) ? src.picked_assets : [];
    const sceneRefFallbacks: string[] = pickedAssets
      .map((a: any) => a?.url).filter((u: any) => typeof u === 'string' && /^https?:/.test(u)).slice(0, 4);

    const refs: string[] = [];
    if (characterRefUrl) refs.push(characterRefUrl);
    const sceneRef = sceneRefFallbacks[shotIndex % Math.max(1, sceneRefFallbacks.length)];
    if (sceneRef && !refs.includes(sceneRef)) refs.push(sceneRef);

    const promptText =
      `${shot.prompt || ''}\n【硬约束】主体必须与参考图第 1 张为同一人物;9:16 竖版;` +
      `不要出现明星/网红/影视角色;不要出现文字水印;` +
      `节奏紧凑,${shot.duration}s 内完成动作与台词。`;

    await admin.from("video_generation_shots").update({
      status: 'submitting', error_message: null, video_url: null, seedance_task_id: null,
      retry_count: (shot.retry_count || 0) + 1,
    }).eq("id", shot.id);

    const sub = await submitSeedanceSegment({
      arkKey: ARK_KEY!, admin, userId: job.user_id,
      model: modelInfo.id,
      prompt: promptText.slice(0, 1800),
      ratio: job.aspect_ratio || '9:16',
      duration: Number(shot.duration),
      resolution,
      referenceImages: refs,
      storyboardRefs: [],
      requireStoryboard: false,
      facePipeline: characterRefUrl ? 'character_sheet' : 'faceless',
    });
    if (!sub.ok || !sub.id) {
      await admin.from("video_generation_shots").update({
        status: 'failed', error_message: sub.error || '重试提交失败',
      }).eq("id", shot.id);
      return json({ ok: false, error: sub.error });
    }
    await admin.from("video_generation_shots").update({
      status: 'running', seedance_task_id: sub.id, reference_image_url: characterRefUrl,
    }).eq("id", shot.id);

    // 如果 job 已经 failed,重新回到 shooting
    if (job.status === 'failed') {
      await admin.from("video_generation_jobs").update({
        status: 'shooting', error_message: null,
      }).eq("id", jobId);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("[director-retry-shot] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

// director-run-pipeline:
// 主控器。按 7 步串行推进(理解→脚本→拆分镜→创建角色→逐镜提交→[等镜头]→保存)。
// 这一版实际做:
//   step1-3 = 已由 create-job 落库,这里只把 status 推到 character。
//   step4 = 用 Lovable AI Nano Banana 生成一张角色参考图,上传到 marketing-videos bucket。
//   step5 = 对每个 shot 直接调 _shared/seedance-submit.ts 提交 Seedance,
//           referenceImages = [character_ref] (锁人),facePipeline='character_sheet'。
//   step6/7 由前端在所有 shot 完成后调 director-complete-job 拼片 + 存素材库。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { submitSeedanceSegment } from "../_shared/seedance-submit.ts";
import { resolveSeedanceModel, clampResolution, DEFAULT_SEEDANCE_2 } from "../_shared/seedance-models.ts";
import { generateCharacterReferenceImage, dataUrlToBytes } from "../_shared/director-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function updateJob(admin: any, id: string, patch: Record<string, unknown>) {
  await admin.from("video_generation_jobs").update(patch).eq("id", id);
}
async function updateShot(admin: any, jobId: string, idx: number, patch: Record<string, unknown>) {
  await admin.from("video_generation_shots").update(patch).eq("job_id", jobId).eq("shot_index", idx);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const ARK_KEY = Deno.env.get("ARK_API_KEY");
    if (!ARK_KEY) return json({ ok: false, error: "缺少 ARK_API_KEY(火山方舟)" }, 500);

    const body = await req.json().catch(() => ({}));
    const jobId: string = body.job_id;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job, error: jErr } = await admin
      .from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (jErr || !job) return json({ ok: false, error: '任务不存在' }, 404);

    const shopId = job.shop_id;
    const src = (job.source_pick_json || {}) as any;
    const persona = src.persona || {};
    const modelInfo = resolveSeedanceModel(src.model || DEFAULT_SEEDANCE_2);
    const resolution = clampResolution(modelInfo, src.resolution || modelInfo.default_resolution);
    const aspectRatio = job.aspect_ratio || '9:16';

    // ---- step4: 生成角色参考图 ----
    await updateJob(admin, jobId, { status: 'character' });
    let characterRefUrl: string | null = null;
    let characterCard: Record<string, unknown> = {};
    try {
      const { dataUrl, card } = await generateCharacterReferenceImage({
        apiKey: LOVABLE_API_KEY,
        persona: {
          label: persona.label,
          gender: persona.gender,
          age: persona.age,
          visual: persona.visual,
          vibe: persona.vibe,
        },
      });
      characterCard = card;
      const bytes = await dataUrlToBytes(dataUrl);
      const path = `director-characters/${shopId || 'no-shop'}/${jobId}.png`;
      const up = await admin.storage.from("marketing-videos").upload(path, bytes, {
        contentType: "image/png", upsert: true,
      });
      if (up.error) throw new Error("角色图上传失败: " + up.error.message);
      const signed = await admin.storage.from("marketing-videos").createSignedUrl(path, 60 * 60 * 24 * 365);
      characterRefUrl = signed.data?.signedUrl || null;
      if (!characterRefUrl) throw new Error("角色图签名失败");
      await updateJob(admin, jobId, {
        character_json: { ...characterCard, reference_image_url: characterRefUrl },
      });
    } catch (e) {
      const message = `角色参考图生成失败:${(e as Error).message || String(e)}`;
      console.error("[director-run-pipeline] character gen failed", e);
      await updateJob(admin, jobId, { status: 'failed', error_message: message });
      await admin.from('video_generation_shots').update({ status: 'failed', error_message: message }).eq('job_id', jobId);
      return json({ ok: false, error: message }, 500);
    }

    // ---- step5: 逐镜提交 Seedance ----
    await updateJob(admin, jobId, { status: 'shooting' });
    const { data: shots } = await admin
      .from("video_generation_shots").select("*").eq("job_id", jobId).order("shot_index");
    if (!shots || !shots.length) {
      await updateJob(admin, jobId, { status: 'failed', error_message: '没有可拍的镜头' });
      return json({ ok: false, error: '无镜头' });
    }

    // 用户上传的门头/实景素材(fallback 参考图)
    const pickedAssets: any[] = Array.isArray(src.picked_assets) ? src.picked_assets : [];
    const sceneRefFallbacks: string[] = pickedAssets
      .map((a: any) => a?.url).filter((u: any) => typeof u === 'string' && /^https?:/.test(u))
      .slice(0, 4);

    // 并发上限 2,防止方舟被打爆
    const concurrency = 2;
    let cursor = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= shots.length) break;
        const shot = shots[idx];
        try {
          await updateShot(admin, jobId, shot.shot_index, { status: 'submitting', error_message: null });
          const refs: string[] = [characterRefUrl!];
          const meta = shot.meta && typeof shot.meta === 'object' ? shot.meta : {};
          const plannedIndices: number[] = Array.isArray(meta.image_indices)
            ? meta.image_indices.filter((value: unknown) => Number.isInteger(value)).slice(0, 2)
            : [];
          const indexedAssets = new Map<number, string>();
          pickedAssets.forEach((asset: any, position: number) => {
            const assetIndex = Number.isInteger(asset?.index) ? Number(asset.index) : position;
            if (typeof asset?.url === 'string' && /^https?:/.test(asset.url)) indexedAssets.set(assetIndex, asset.url);
          });
          const plannedSceneRefs = plannedIndices.map((assetIndex) => indexedAssets.get(assetIndex)).filter(Boolean) as string[];
          const sceneRefs = plannedSceneRefs.length
            ? plannedSceneRefs
            : [sceneRefFallbacks[idx % Math.max(1, sceneRefFallbacks.length)]].filter(Boolean);
          for (const sceneRef of sceneRefs) {
            if (!refs.includes(sceneRef)) refs.push(sceneRef);
          }

          const promptText =
            `${shot.prompt || ''}\n【硬约束】主体必须与参考图第 1 张为同一人物;9:16 竖版;` +
            `不要出现明星/网红/影视角色;` +
            `不要出现任何文字水印/字幕/logo;` +
            `角色的脸、发型、服装、年龄感必须与第 1 张参考图完全一致;` +
            `其余参考图是本镜头的真实场景/商品依据,不得替换成无关场景;` +
            `严格按提示词中的节拍顺序表演,${shot.duration}s 内完整完成动作与台词。`;

          const sub = await submitSeedanceSegment({
            arkKey: ARK_KEY!,
            admin,
            userId: job.user_id,
            model: modelInfo.id,
            prompt: promptText.slice(0, 1800),
            ratio: aspectRatio,
            duration: shot.duration,
            resolution,
            referenceImages: refs,
            storyboardRefs: sceneRefs,
            requireStoryboard: sceneRefs.length > 0,
            facePipeline: characterRefUrl ? 'character_sheet' : 'faceless',
          });
          if (!sub.ok || !sub.id) {
            await updateShot(admin, jobId, shot.shot_index, {
              status: 'failed', error_message: sub.error || '提交失败',
            });
            continue;
          }
          await updateShot(admin, jobId, shot.shot_index, {
            status: 'running',
            seedance_task_id: sub.id,
            reference_image_url: characterRefUrl,
            meta: {
              ...meta,
              fallback_notes: sub.fallbackNotes,
              ref_count: sub.referenceCount,
              mode: sub.mode,
              submitted_duration: sub.duration,
              scene_reference_count: sceneRefs.length,
            },
          });
        } catch (e) {
          console.error("[director-run-pipeline] shot submit error", shot.shot_index, e);
          await updateShot(admin, jobId, shot.shot_index, {
            status: 'failed', error_message: (e as Error).message || String(e),
          });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // step6/7 由前端在所有 shot succeeded 后调 director-complete-job 完成拼片+入库。
    return json({ ok: true, job_id: jobId, character_ref_url: characterRefUrl });
  } catch (e) {
    console.error("[director-run-pipeline] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

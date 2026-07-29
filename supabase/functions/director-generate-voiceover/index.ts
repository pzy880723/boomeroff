// director-generate-voiceover:
// 全片一次 TTS(禁止逐镜),生成 voiceover/{jobId}/full.mp3。
// - 按 shot_index 顺序拼接所有 dialogue/subtitle 文本,调用一次 openai/gpt-4o-mini-tts。
// - job.meta.voiceover.url = 全片 mp3 的 signed url。
// - job.meta.subtitles: 每镜 start_s/end_s 按 shot.duration 累加,和 shot_index 一一对应。
// - shots.meta 写入 voiceover_text / voiceover_start_s / voiceover_duration_s;voiceover_url 固定 null。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const TTS_ENDPOINT = "https://ai.gateway.lovable.dev/v1/audio/speech";
const TTS_MODEL = "openai/gpt-4o-mini-tts";

function pickVoice(persona: any): string {
  const gender = String(persona?.gender || "").toLowerCase();
  if (gender.includes("male") && !gender.includes("female")) return "onyx";
  if (gender.includes("female")) return "shimmer";
  return "alloy";
}

async function ttsToMp3(apiKey: string, text: string, voice: string, instructions?: string): Promise<Uint8Array> {
  const r = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text.slice(0, 3500),
      voice,
      response_format: "mp3",
      ...(instructions ? { instructions } : {}),
    }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text().catch(() => "")}`);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ ok: false, error: "缺少 LOVABLE_API_KEY" }, 500);

    const body = await req.json().catch(() => ({}));
    const jobId: string = body.job_id;
    if (!jobId) return json({ ok: false, error: "缺少 job_id" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: job } = await admin.from("video_generation_jobs").select("*").eq("id", jobId).single();
    if (!job) return json({ ok: false, error: "任务不存在" }, 404);

    const { data: shots } = await admin
      .from("video_generation_shots").select("*").eq("job_id", jobId).order("shot_index");
    if (!shots?.length) return json({ ok: false, error: "无镜头" });

    const persona = (job.source_pick_json as any)?.persona || {};
    const voice = pickVoice(persona);
    const toneLabel = persona?.tone_label ? `${persona.tone_label}的语气` : "自然口语化的语气";
    const instructions =
      `全片必须保持同一个音色、同一个语速、同一个口音、同一个发音风格,不得中途切换成不同的人。` +
      `请用${toneLabel},像在店里跟朋友分享,不要念广告腔;` +
      `分镜之间只做极短的自然停顿,禁止重新开场或重复自我介绍。`;

    await admin.from("video_generation_jobs").update({ status: "generating_voice" }).eq("id", jobId);

    // 1) 顺序拼接全片文本,累计每镜时间轴
    const subtitles: Array<{ shot_index: number; text: string; start_s: number; end_s: number }> = [];
    const textParts: string[] = [];
    let cursor = 0;
    for (const shot of shots) {
      const text = String(shot.dialogue || shot.subtitle || "").trim();
      const durS = Math.max(1, Math.min(15, Number(shot.duration) || 3));
      if (text) textParts.push(text);
      subtitles.push({
        shot_index: shot.shot_index,
        text,
        start_s: +cursor.toFixed(2),
        end_s: +(cursor + durS).toFixed(2),
      });
      cursor += durS;
    }
    const fullText = textParts.join(" ").trim();

    // 2) 一次 TTS 生成整段
    const bucket = "marketing-videos";
    let voiceoverUrl: string | null = null;
    let hadError: string | null = null;
    if (fullText) {
      try {
        const bytes = await ttsToMp3(LOVABLE_API_KEY, fullText, voice, instructions);
        const path = `voiceover/${jobId}/full.mp3`;
        const up = await admin.storage.from(bucket).upload(path, bytes, {
          contentType: "audio/mpeg", upsert: true,
        });
        if (up.error) throw new Error(up.error.message);
        const signed = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
        voiceoverUrl = signed.data?.signedUrl || null;
      } catch (e) {
        hadError = (e as Error).message || String(e);
        console.warn("[voiceover] full-mix failed", hadError);
      }
    }

    // 3) 每镜写 meta：voiceover_url 固定 null;文本 + 起止 + 时长
    for (const sub of subtitles) {
      const shot = shots.find((s: any) => s.shot_index === sub.shot_index);
      if (!shot) continue;
      const shotMeta = (shot.meta as any) || {};
      await admin.from("video_generation_shots").update({
        meta: {
          ...shotMeta,
          voiceover_url: null,
          voiceover_text: sub.text,
          voiceover_start_s: sub.start_s,
          voiceover_duration_s: +(sub.end_s - sub.start_s).toFixed(2),
        },
      }).eq("id", shot.id);
    }

    const jobMeta = (job.meta as any) || {};
    await admin.from("video_generation_jobs").update({
      meta: {
        ...jobMeta,
        subtitles,
        voiceover: {
          model: TTS_MODEL,
          voice,
          url: voiceoverUrl,
          total_duration_s: +cursor.toFixed(2),
          error: hadError,
          generated_at: new Date().toISOString(),
        },
      },
    }).eq("id", jobId);

    return json({ ok: true, subtitles, total_duration_s: cursor, voice, url: voiceoverUrl, error: hadError });
  } catch (e) {
    console.error("[director-generate-voiceover] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

// director-generate-voiceover:
// 逐 shot 调 Lovable AI TTS 生成 mp3,上传到 storage,回写 shots.meta.voiceover_url
// 汇总生成字幕时间轴 job.meta.subtitles / job.meta.voiceover
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

// mp3 时长精确解析太重,按字数估算 (中文 ~ 5 字/秒)
function estimateDurationS(text: string): number {
  const n = (text || "").replace(/\s+/g, "").length;
  if (n <= 0) return 1;
  return Math.max(1, Math.min(15, +(n / 5).toFixed(2)));
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
    const instructions = persona?.tone_label
      ? `请用${persona.tone_label}的语气,自然口语化,像在跟朋友分享,不要念广告腔。`
      : "自然口语化,像在店里跟顾客介绍。";

    await admin.from("video_generation_jobs").update({ status: "generating_voice" }).eq("id", jobId);

    const bucket = "marketing-videos";
    const subtitles: Array<{ shot_index: number; text: string; start_s: number; end_s: number }> = [];
    let cursor = 0;
    let hadError: string | null = null;

    for (const shot of shots) {
      const text = String(shot.subtitle || shot.dialogue || "").trim();
      const shotMeta = (shot.meta as any) || {};
      let voiceoverUrl: string | null = null;
      let durS = Number(shot.duration) || estimateDurationS(text);

      if (text) {
        try {
          const bytes = await ttsToMp3(LOVABLE_API_KEY, text, voice, instructions);
          const path = `voiceover/${jobId}/shot-${String(shot.shot_index).padStart(2, "0")}.mp3`;
          const up = await admin.storage.from(bucket).upload(path, bytes, {
            contentType: "audio/mpeg", upsert: true,
          });
          if (up.error) throw new Error(up.error.message);
          const signed = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
          voiceoverUrl = signed.data?.signedUrl || null;
          durS = estimateDurationS(text);
        } catch (e) {
          const msg = (e as Error).message || String(e);
          console.warn("[voiceover] shot", shot.shot_index, "failed", msg);
          hadError = hadError || msg;
        }
      }

      await admin.from("video_generation_shots").update({
        meta: { ...shotMeta, voiceover_url: voiceoverUrl, voiceover_text: text, voiceover_duration_s: durS },
      }).eq("id", shot.id);

      subtitles.push({
        shot_index: shot.shot_index,
        text,
        start_s: +cursor.toFixed(2),
        end_s: +(cursor + durS).toFixed(2),
      });
      cursor += durS;
    }

    const jobMeta = (job.meta as any) || {};
    await admin.from("video_generation_jobs").update({
      meta: {
        ...jobMeta,
        subtitles,
        voiceover: {
          model: TTS_MODEL,
          voice,
          total_duration_s: +cursor.toFixed(2),
          error: hadError,
          generated_at: new Date().toISOString(),
        },
      },
    }).eq("id", jobId);

    return json({ ok: true, subtitles, total_duration_s: cursor, voice, error: hadError });
  } catch (e) {
    console.error("[director-generate-voiceover] fatal", e);
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
});

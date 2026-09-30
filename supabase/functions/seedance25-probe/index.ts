// 临时探针:用真实提交层发一个最小 Seedance 2.5 任务。验证后删除。
import { submitSeedanceSegment } from "../_shared/seedance-submit.ts";
Deno.serve(async (req) => {
  if (req.headers.get("x-probe-token") !== "9438dfde1001a4695cb9d8f49d26a139") return new Response("no", { status: 403 });
  const arkKey = Deno.env.get("ARK_API_KEY");
  if (!arkKey) return Response.json({ ok: false, error: "ARK_API_KEY missing" });
  const r = await submitSeedanceSegment({
    arkKey, admin: null, userId: "probe",
    model: "doubao-seedance-2-5-260628",
    prompt: "一只橘猫在木桌上缓慢眨眼,固定镜头,暖光。",
    ratio: "9:16", duration: 4, resolution: "480p",
    referenceImages: [], generateAudio: false,
  });
  return Response.json(r);
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "未登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "仅管理员可用" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "缺少 prompt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content: `Square product cover, clean background, soft natural light, centered, photorealistic, no text watermark. Subject: ${prompt}` },
        ],
        modalities: ["image", "text"],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("Image AI error", aiResp.status, t);
      const status = aiResp.status === 429 ? 429 : aiResp.status === 402 ? 402 : 500;
      const msg = status === 429 ? "AI 调用频率过高。" : status === 402 ? "AI 额度不足。" : "图像生成失败。";
      return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const data = await aiResp.json();
    const dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
    if (!dataUrl?.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "未生成图像" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(image\/[a-zA-Z+]+)/)?.[1] ?? "image/png";
    const ext = mime.includes("png") ? "png" : mime.includes("jpeg") ? "jpg" : "png";
    const bytes = b64ToBytes(b64);
    const path = `official-covers/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("product-images").upload(path, bytes, {
      contentType: mime, upsert: false,
    });
    if (up.error) {
      console.error("upload error", up.error);
      return new Response(JSON.stringify({ error: "封面上传失败" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    return new Response(JSON.stringify({ url: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { notification_id, title, body, preview_only } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "缺少标题" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!preview_only && !notification_id) {
      return new Response(JSON.stringify({ error: "缺少参数" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `Wide 16:6 minimalist brand banner for a Japanese second-hand retail chain called BOOMER GO. Theme: ${title}. Details: ${(body || '').slice(0, 120)}. Use vermilion red (#E1251B) and warm off-white as the main palette. Editorial documentary style, soft natural window light, subtle grain, no text, no watermark, no logo, no people faces.`;

    const callImage = async (model: string) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 55000);
      try {
        return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(t); }
    };

    const extract = (d: any): string | undefined => {
      const msg = d?.choices?.[0]?.message;
      const fromImages = msg?.images?.[0]?.image_url?.url || msg?.images?.[0]?.url;
      if (typeof fromImages === "string") return fromImages;
      const c = msg?.content;
      if (Array.isArray(c)) {
        for (const part of c) {
          const u = part?.image_url?.url || part?.url;
          if (typeof u === "string" && u.startsWith("data:image/")) return u;
        }
      }
      return undefined;
    };

    let dataUrl: string | undefined;
    for (const model of ["google/gemini-3.1-flash-image", "google/gemini-2.5-flash-image"]) {
      try {
        const r = await callImage(model);
        if (!r.ok) { console.warn("banner attempt failed", model, r.status); continue; }
        const j = await r.json();
        dataUrl = extract(j);
        if (dataUrl?.startsWith("data:image/")) break;
      } catch (e) {
        console.warn("banner attempt threw", model, e instanceof Error ? e.message : e);
      }
    }

    if (!dataUrl?.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "AI 未能生成 banner" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/data:(image\/[a-zA-Z+]+)/)?.[1] ?? "image/png";
    const ext = mime.includes("png") ? "png" : "jpg";
    const bytes = b64ToBytes(b64);
    const idPart = notification_id || `preview-${userData.user.id}-${Date.now()}`;
    const path = `notification-banners/${idPart}.${ext}`;
    const up = await supabase.storage.from("product-images").upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (up.error) {
      return new Response(JSON.stringify({ error: "上传失败" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    if (notification_id && !preview_only) {
      await supabase.from("notifications").update({ image_url: pub.publicUrl, category: "banner" }).eq("id", notification_id);
    }
    return new Response(JSON.stringify({ url: pub.publicUrl, image_url: pub.publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

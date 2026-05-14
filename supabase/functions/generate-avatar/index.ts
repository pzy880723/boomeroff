import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PALETTES = [
  "warm orange and cream",
  "soft sage green and ivory",
  "dusty pink and beige",
  "mustard yellow and brown",
  "navy blue and pale blue",
  "lavender and mint",
  "terracotta and sand",
  "coral and peach",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "未授权" }, 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "未授权" }, 401);

    const body = await req.json().catch(() => ({}));
    const displayName: string = (body.display_name || user.email?.split("@")[0] || "店员").toString().trim();
    const initial = displayName.charAt(0) || "店";
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

    const prompt = `A cute flat-illustration circular avatar with a single big stylized character "${initial}" in the center, ${palette} color palette, minimal cartoon style, soft gradients, clean shapes, no text other than the single character, on a solid pastel background, 1:1 square. Friendly and approachable, suitable as a profile picture for a retail staff app.`;

    // Call Lovable AI Gateway image model
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      if (aiRes.status === 429) return json({ error: "生成过于频繁，请稍后再试" }, 429);
      if (aiRes.status === 402) return json({ error: "AI 额度已用尽" }, 402);
      return json({ error: "AI 生成失败" }, 500);
    }

    const aiJson = await aiRes.json();
    const imgUrl: string | undefined =
      aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imgUrl || !imgUrl.startsWith("data:image")) {
      console.error("No image in response", JSON.stringify(aiJson).slice(0, 500));
      return json({ error: "AI 未返回图片" }, 500);
    }

    // data URL → bytes
    const m = imgUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return json({ error: "图片格式异常" }, 500);
    const mime = m[1];
    const ext = mime.split("/")[1].replace("+xml", "").replace("jpeg", "jpg");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));

    // Upload via service role
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const path = `${user.id}/ai-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from("avatars").upload(path, bytes, {
      contentType: mime,
      upsert: true,
    });
    if (upErr) {
      console.error("upload error", upErr);
      return json({ error: "上传失败" }, 500);
    }
    const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // Update profile
    await admin.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);

    return json({ success: true, avatar_url: publicUrl });
  } catch (e) {
    console.error("generate-avatar error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
});

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

    // 去品牌化兜底：常见易触发版权策略的专有名词 → 通用类目描述
    const BRAND_MAP: Array<{ re: RegExp; replace: string; hint: string }> = [
      { re: /\b(koransha|fukagawa|arita|imari|kutani|mino|hasami)\b/gi, replace: "Japanese-style porcelain piece", hint: "Japanese porcelain piece" },
      { re: /香兰社|深川制磁|有田烧|九谷烧|伊万里|美浓烧|波佐见烧/g, replace: "Japanese-style porcelain piece", hint: "Japanese porcelain piece" },
      { re: /\b(meissen|wedgwood|royal\s*copenhagen|herend|ginori|royal\s*albert|noritake)\b/gi, replace: "European-style porcelain piece", hint: "European porcelain piece" },
      { re: /\b(sonny\s*angel|bearbrick|be@rbrick|nendoroid|funko|smiski|labubu|molly|dimoo)\b/gi, replace: "designer vinyl figurine", hint: "designer vinyl figurine" },
      { re: /\b(pokemon|pokémon|hello\s*kitty|sanrio|disney|ghibli|studio\s*ghibli|gundam|evangelion|naruto|dragon\s*ball|one\s*piece|doraemon|snoopy|marvel)\b/gi, replace: "anime-style collectible item", hint: "anime-style collectible" },
      { re: /\b(walkman|discman)\b/gi, replace: "vintage portable cassette player", hint: "vintage portable cassette player" },
      { re: /\b(sony|panasonic|toshiba|sharp|aiwa|kenwood|denon|marantz|technics|pioneer|jvc|nakamichi)\b/gi, replace: "vintage audio device", hint: "vintage audio device" },
      { re: /\b(nintendo|gameboy|game\s*boy|famicom|playstation|ps\d|sega|saturn|dreamcast|xbox)\b/gi, replace: "vintage handheld game console", hint: "vintage handheld game console" },
      { re: /\b(canon|nikon|olympus|minolta|pentax|leica|fujifilm|contax|yashica|ricoh)\b/gi, replace: "vintage compact camera", hint: "vintage compact camera" },
      { re: /\b(hermes|hermès|chanel|louis\s*vuitton|gucci|prada|dior|fendi|celine|burberry|coach|bvlgari|cartier|tiffany|rolex|omega|seiko|casio)\b/gi, replace: "luxury accessory", hint: "luxury accessory" },
      { re: /爱马仕|香奈儿|路易威登|古驰|普拉达|迪奥|劳力士|欧米茄/g, replace: "luxury accessory", hint: "luxury accessory" },
    ];

    let categoryHint = "product";
    const sanitizePrompt = (s: string): string => {
      let out = s;
      for (const m of BRAND_MAP) {
        if (m.re.test(out)) {
          categoryHint = m.hint;
          out = out.replace(m.re, m.replace);
        }
      }
      // 移除常见容易触发策略的修饰
      out = out.replace(/\b(brand|brand[- ]?name|signature|official|licensed|copyright|trademark|character)\b/gi, "");
      return out;
    };

    const cleaned = sanitizePrompt(prompt);
    if (cleaned !== prompt) {
      console.warn("Sanitized cover prompt:", prompt, "=>", cleaned);
    }
    const fullPrompt = `Square product cover. Subject: ${cleaned}. On plain white background, soft natural light, centered, photorealistic, no text, no watermark, no logo.`;
    const fallbackPrompt = `A ${categoryHint} on plain white background, soft natural light, centered, photorealistic, no text, no watermark, no logo.`;

    const callImage = async (model: string, body: string, timeoutMs = 18000) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: body }],
            modalities: ["image", "text"],
          }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    };

    const extractDataUrl = (d: any): string | undefined => {
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

    // 依次尝试：新模型完整 prompt → 旧模型完整 prompt → 新模型简化 prompt
    const attempts: Array<{ model: string; body: string; label: string }> = [
      { model: "google/gemini-3.1-flash-image-preview", body: fullPrompt, label: "v3.1 full" },
      { model: "google/gemini-2.5-flash-image", body: fullPrompt, label: "v2.5 full" },
      { model: "google/gemini-3.1-flash-image-preview", body: fallbackPrompt, label: "v3.1 fallback" },
    ];

    let dataUrl: string | undefined;
    for (const a of attempts) {
      let r: Response;
      try {
        r = await callImage(a.model, a.body);
      } catch (e) {
        console.error("Image attempt threw:", a.label, e instanceof Error ? e.message : e);
        continue;
      }
      if (!r.ok) {
        console.error("Image attempt failed:", a.label, r.status, (await r.text()).slice(0, 400));
        if (r.status === 429 || r.status === 402) {
          const msg = r.status === 429 ? "AI 调用频率过高，请稍后再试。" : "AI 额度不足。";
          return new Response(JSON.stringify({ error: msg }), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        continue;
      }
      const d = await r.json();
      dataUrl = extractDataUrl(d);
      if (dataUrl?.startsWith("data:image/")) {
        console.log("Image succeeded on attempt:", a.label);
        break;
      }
      console.warn("No image in response, attempt:", a.label, JSON.stringify(d).slice(0, 400));
    }

    if (!dataUrl?.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "AI 未能生成封面，请稍后再试或调整描述。" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

// 简单内存限流：每用户每分钟最多 15 次
const rate = new Map<string, number[]>();
function checkRate(uid: string): boolean {
  const now = Date.now();
  const arr = (rate.get(uid) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 15) return false;
  arr.push(now);
  rate.set(uid, arr);
  return true;
}

// 从 HTML 中抽取 <img> 大图
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // 同时支持 og:image meta
  const ogRe = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = ogRe.exec(html))) {
    const u = absUrl(m[1], baseUrl);
    if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  }
  const imgRe = /<img\b[^>]*?(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi;
  while ((m = imgRe.exec(html))) {
    const u = absUrl(m[1], baseUrl);
    if (!u || seen.has(u)) continue;
    if (!isLikelyProductImage(u, m[0])) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function absUrl(u: string, base: string): string | null {
  try {
    if (!u) return null;
    if (u.startsWith("data:")) return null;
    return new URL(u, base).toString();
  } catch { return null; }
}

function isLikelyProductImage(url: string, tag: string): boolean {
  const low = url.toLowerCase();
  if (/\.(svg|gif)(\?|$)/.test(low)) return false;
  if (/(sprite|favicon|logo|avatar|emoji|button|banner|placeholder|blank|loading|spinner)/.test(low)) return false;
  // 尝试从 width/height 属性判断
  const w = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] || 0);
  const h = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1] || 0);
  if ((w && w < 200) || (h && h < 200)) return false;
  return true;
}

async function mirrorImage(
  supabase: any,
  url: string,
  pathPrefix: string,
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BoomerOff/1.0)" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 5000) return null; // 太小，可能不是商品图
    if (buf.length > 8 * 1024 * 1024) return null;
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("product-images").upload(path, buf, {
      contentType: ct, upsert: false,
    });
    if (up.error) return null;
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    return pub.publicUrl;
  } catch (e) {
    console.warn("mirror failed", url, (e as Error).message);
    return null;
  }
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
    if (!checkRate(userData.user.id)) {
      return new Response(JSON.stringify({ error: "请求过于频繁，请稍后再试" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { query, intent = "gallery", limit = 3, mirror = true, pathPrefix = "web-images" } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "缺少 query" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY 未配置", images: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const q = intent === "backstamp"
      ? `${query} 底款 OR backstamp OR mark OR 銘 OR 底部`
      : `${query} 商品 真实图`;

    // 调用 Firecrawl search，要求返回页面内容
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    let searchData: any = null;
    try {
      const sr = await fetch(`${FIRECRAWL_V2}/search`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: q,
          limit: 6,
          scrapeOptions: { formats: ["html"], onlyMainContent: false },
        }),
      });
      if (!sr.ok) {
        const txt = await sr.text();
        console.error("firecrawl search failed", sr.status, txt.slice(0, 400));
        return new Response(JSON.stringify({ error: `搜索失败 ${sr.status}`, images: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      searchData = await sr.json();
    } finally {
      clearTimeout(t);
    }

    const results: any[] = searchData?.data?.web || searchData?.data || searchData?.web || [];
    const candidates: { url: string; source: string }[] = [];
    for (const r of results) {
      const html: string = r?.html || r?.markdown || "";
      const sourceUrl: string = r?.url || r?.metadata?.sourceURL || "";
      if (!html || !sourceUrl) continue;
      const imgs = extractImagesFromHtml(html, sourceUrl);
      for (const u of imgs.slice(0, 8)) {
        candidates.push({ url: u, source: sourceUrl });
      }
    }

    // 去重，限制候选总量
    const seen = new Set<string>();
    const uniq = candidates.filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    }).slice(0, 24);

    // 镜像下载，直到拿到 limit 张
    const finalImages: { url: string; source: string }[] = [];
    if (mirror) {
      for (const c of uniq) {
        if (finalImages.length >= limit) break;
        const mirrored = await mirrorImage(supabase, c.url, pathPrefix);
        if (mirrored) finalImages.push({ url: mirrored, source: c.source });
      }
    } else {
      finalImages.push(...uniq.slice(0, limit));
    }

    return new Response(JSON.stringify({ images: finalImages, found: uniq.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误", images: [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

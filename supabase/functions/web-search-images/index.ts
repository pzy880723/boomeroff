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

function isLikelyProductImage(url: string): boolean {
  const low = url.toLowerCase();
  if (/\.(svg|gif)(\?|$)/.test(low)) return false;
  if (/(sprite|favicon|logo|avatar|emoji|button|banner|placeholder|blank|loading|spinner)/.test(low)) return false;
  return true;
}

// 抽取 URL 路径基名做去重，避免同图不同尺寸缩略图
function dedupKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/[-_]?\d{2,4}x\d{2,4}/g, "").replace(/[-_](thumb|small|s|m|l|xl|preview)\b/gi, "");
  } catch {
    return url;
  }
}

// 兜底：从 HTML 中抽取 <img>
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
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
    if (!isLikelyProductImage(u)) continue;
    const w = Number(m[0].match(/\bwidth=["']?(\d+)/i)?.[1] || 0);
    const h = Number(m[0].match(/\bheight=["']?(\d+)/i)?.[1] || 0);
    if ((w && w < 200) || (h && h < 200)) continue;
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

async function mirrorImage(
  supabase: any,
  url: string,
  pathPrefix: string,
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BoomerOff/1.0)" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 5000) return null;
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

// 直接调 Firecrawl 图片源
async function searchImages(apiKey: string, query: string, limit: number): Promise<{ url: string; source: string }[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const sr = await fetch(`${FIRECRAWL_V2}/search`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        sources: ["images"],
      }),
    });
    if (!sr.ok) {
      const txt = await sr.text();
      console.error("firecrawl image-search failed", sr.status, txt.slice(0, 400));
      return [];
    }
    const json = await sr.json();
    const arr: any[] = json?.data?.images || json?.images || [];
    const out: { url: string; source: string }[] = [];
    for (const it of arr) {
      const url = it?.imageUrl || it?.url || it?.src;
      const source = it?.url || it?.position?.url || it?.source || "";
      if (typeof url === "string" && isLikelyProductImage(url)) {
        out.push({ url, source });
      }
    }
    return out;
  } catch (e) {
    console.error("firecrawl image-search exception", (e as Error).message);
    return [];
  } finally {
    clearTimeout(t);
  }
}

// 兜底：旧的网页 + HTML 解析
async function searchViaPages(apiKey: string, query: string): Promise<{ url: string; source: string }[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const sr = await fetch(`${FIRECRAWL_V2}/search`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ["html"], onlyMainContent: false },
      }),
    });
    if (!sr.ok) return [];
    const json = await sr.json();
    const results: any[] = json?.data?.web || json?.data || json?.web || [];
    const out: { url: string; source: string }[] = [];
    for (const r of results) {
      const html: string = r?.html || "";
      const sourceUrl: string = r?.url || r?.metadata?.sourceURL || "";
      if (!html || !sourceUrl) continue;
      const imgs = extractImagesFromHtml(html, sourceUrl);
      for (const u of imgs.slice(0, 6)) out.push({ url: u, source: sourceUrl });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
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
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY 未配置", images: [], reason: "missing_api_key" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const q = intent === "backstamp"
      ? `${query} backstamp 底款 mark`
      : query;

    // 1) 主路径：图片搜索
    let candidates = await searchImages(FIRECRAWL_API_KEY, q, Math.max(12, limit * 4));

    // 2) 兜底：网页解析
    if (candidates.length === 0) {
      candidates = await searchViaPages(FIRECRAWL_API_KEY, q);
    }

    // 去重
    const seen = new Set<string>();
    const uniq = candidates.filter((c) => {
      const k = dedupKey(c.url);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (uniq.length === 0) {
      return new Response(JSON.stringify({ images: [], found: 0, reason: "no_results" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mirror) {
      return new Response(JSON.stringify({ images: uniq.slice(0, limit), found: uniq.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 并发镜像下载，多取一些做候选；先到先得，凑够 limit 即可
    const pool = uniq.slice(0, Math.max(limit * 3, 9));
    const settled = await Promise.allSettled(
      pool.map((c) => mirrorImage(supabase, c.url, pathPrefix).then((m) => m ? { url: m, source: c.source } : null)),
    );
    const finalImages: { url: string; source: string }[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value) finalImages.push(s.value);
      if (finalImages.length >= limit) break;
    }

    return new Response(JSON.stringify({
      images: finalImages,
      found: uniq.length,
      reason: finalImages.length === 0 ? "all_mirror_failed" : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "未知错误", images: [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

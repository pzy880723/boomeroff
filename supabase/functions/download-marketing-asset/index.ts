// 代理下载素材文件,强制 attachment 头,绕过浏览器跨域 fetch 限制。
// 支持视频(asset.output_url 来自火山 TOS)与图片(Supabase Storage 公开链接)。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-disposition, content-length, content-type",
};

const ALLOWED_HOSTS = new Set<string>([
  "ark-content-generation-cn-beijing.tos-cn-beijing.volces.com",
]);

function isHostAllowed(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;
  // Supabase Storage 域名 (xxx.supabase.co)
  if (host.endsWith(".supabase.co")) return true;
  if (host.endsWith(".supabase.in")) return true;
  return false;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

function guessExt(url: string, contentType: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").pop() || "";
    const m = tail.match(/\.([a-zA-Z0-9]{2,5})(?:$|\?)/);
    if (m) return m[1].toLowerCase();
  } catch { /* noop */ }
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  return "bin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "服务器配置缺失" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 鉴权: 必须是登录用户
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "请先登录" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let assetId = "";
    let preferredName = "";
    if (req.method === "GET") {
      const u = new URL(req.url);
      assetId = u.searchParams.get("asset_id") || "";
      preferredName = u.searchParams.get("filename") || "";
    } else {
      const body = await req.json().catch(() => ({} as any));
      assetId = body.asset_id || "";
      preferredName = body.filename || "";
    }
    if (!assetId) {
      return new Response(JSON.stringify({ error: "缺少 asset_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 用 service role 查素材(RLS 在这里手动做)
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: asset, error: aErr } = await admin
      .from("marketing_assets")
      .select("id, kind, output_url, shop_id, user_id, meta")
      .eq("id", assetId).maybeSingle();
    if (aErr || !asset) {
      return new Response(JSON.stringify({ error: "素材不存在" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!asset.output_url) {
      return new Response(JSON.stringify({ error: "素材尚未生成完成" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 简单权限: 必须是同 shop 成员或本人创建
    if (asset.user_id !== userData.user.id) {
      const { data: membership } = await admin
        .from("user_shops").select("shop_id")
        .eq("user_id", userData.user.id).eq("shop_id", asset.shop_id).maybeSingle();
      if (!membership) {
        const { data: role } = await admin
          .from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
        if (role?.role !== "admin") {
          return new Response(JSON.stringify({ error: "无权下载" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const remoteUrl = asset.output_url as string;
    let host = "";
    try { host = new URL(remoteUrl).hostname; } catch {
      return new Response(JSON.stringify({ error: "素材地址异常" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isHostAllowed(host)) {
      return new Response(JSON.stringify({ error: `不支持的素材来源: ${host}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 透传 Range 以支持断点续传
    const fwdHeaders: Record<string, string> = {};
    const range = req.headers.get("range");
    if (range) fwdHeaders["Range"] = range;

    const upstream = await fetch(remoteUrl, { headers: fwdHeaders });
    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => "");
      return new Response(JSON.stringify({
        error: `下载失败 (${upstream.status})`,
        detail: text.slice(0, 200),
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const contentType = upstream.headers.get("content-type") ||
      (asset.kind === "video" ? "video/mp4" : "application/octet-stream");
    const ext = guessExt(remoteUrl, contentType);
    const baseName = preferredName
      ? safeFilename(preferredName.replace(/\.[a-zA-Z0-9]{2,5}$/, ""))
      : `boomer-${asset.kind || "asset"}-${assetId.slice(0, 8)}`;
    const filename = `${baseName}.${ext}`;

    const headers = new Headers({
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, no-store",
    });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    const cr = upstream.headers.get("content-range");
    if (cr) headers.set("Content-Range", cr);
    const ar = upstream.headers.get("accept-ranges");
    if (ar) headers.set("Accept-Ranges", ar);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || "下载失败" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

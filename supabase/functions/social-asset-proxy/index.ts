// Proxy worker /getFile (HTTP) as HTTPS. Used for QR-code images during login.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { SAU_BASE, sauHeaders } from "../_shared/sau.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const filename = url.searchParams.get("filename") || "";
    if (!filename || !/^[A-Za-z0-9._-]+$/.test(filename)) {
      return new Response("bad filename", { status: 400, headers: corsHeaders });
    }
    const upstream = await fetch(`${SAU_BASE}/getFile?filename=${encodeURIComponent(filename)}`, {
      headers: sauHeaders(),
    });
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "image/png");
    headers.set("Cache-Control", "public, max-age=60");
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: corsHeaders });
  }
});

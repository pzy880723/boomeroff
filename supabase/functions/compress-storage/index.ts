import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "product-images";
const PREFIXES = ["web-gallery", "web-backstamp", "official-covers"];
const SIZE_THRESHOLD = 200 * 1024; // 200KB
const TARGET_WIDTH = 1080;
const TARGET_QUALITY = 78;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: admin only
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
  const isAdmin = roles?.some((r: any) => r.role === "admin");
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "admin only" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = !!body.dryRun;
  const maxFiles = Number(body.maxFiles ?? 1000);
  const prefixes: string[] = body.prefixes ?? PREFIXES;

  const log: any[] = [];
  let processed = 0, skipped = 0, savedBytes = 0, errors = 0;

  for (const prefix of prefixes) {
    let offset = 0;
    const pageSize = 100;
    while (true) {
      const { data: files, error } = await supabase.storage.from(BUCKET)
        .list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
      if (error) { log.push({ prefix, error: error.message }); break; }
      if (!files || files.length === 0) break;

      for (const f of files) {
        if (processed + skipped >= maxFiles) break;
        const size = Number((f as any).metadata?.size ?? 0);
        if (size < SIZE_THRESHOLD) { skipped++; continue; }
        const path = `${prefix}/${f.name}`;
        try {
          // Fetch already-transformed webp via render endpoint
          const transformUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}/${path}?width=${TARGET_WIDTH}&quality=${TARGET_QUALITY}&format=origin`;
          const resp = await fetch(transformUrl, { headers: { Accept: "image/webp" } });
          if (!resp.ok) {
            errors++; log.push({ path, stage: "fetch", status: resp.status }); continue;
          }
          const ct = resp.headers.get("content-type") || "image/webp";
          const buf = new Uint8Array(await resp.arrayBuffer());
          if (buf.byteLength >= size * 0.95) {
            skipped++; continue; // no meaningful gain
          }
          if (dryRun) {
            log.push({ path, oldSize: size, newSize: buf.byteLength, ct });
          } else {
            const { error: upErr } = await supabase.storage.from(BUCKET)
              .update(path, buf, { contentType: ct, cacheControl: "604800", upsert: true });
            if (upErr) {
              errors++; log.push({ path, stage: "upload", error: upErr.message }); continue;
            }
          }
          savedBytes += size - buf.byteLength;
          processed++;
        } catch (e) {
          errors++; log.push({ path, error: String(e) });
        }
      }
      if (files.length < pageSize) break;
      if (processed + skipped >= maxFiles) break;
      offset += pageSize;
    }
  }

  return new Response(JSON.stringify({
    ok: true, dryRun, processed, skipped, errors,
    savedMB: +(savedBytes / 1024 / 1024).toFixed(2),
    sampleLog: log.slice(0, 20),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

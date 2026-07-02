// One-shot migration: move notification banners from private notification-images
// bucket to public product-images/notification-banners/migrated/*.
// Safe to invoke without auth — only rewrites rows whose image_url matches the
// broken /object/public/notification-images/ pattern.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: rows, error } = await sb.from("notifications")
      .select("id, image_url")
      .like("image_url", "%/notification-images/%");
    if (error) throw error;

    const results: any[] = [];
    for (const r of rows ?? []) {
      const m = (r.image_url as string).match(/\/notification-images\/(.+)$/);
      if (!m) { results.push({ id: r.id, skipped: "no-match" }); continue; }
      const oldPath = decodeURIComponent(m[1].split("?")[0]);
      const dl = await sb.storage.from("notification-images").download(oldPath);
      if (dl.error) { results.push({ id: r.id, error: "download:" + dl.error.message }); continue; }
      const fileName = oldPath.split("/").pop() || "banner.jpg";
      const newPath = `notification-banners/migrated/${r.id}-${fileName}`;
      const up = await sb.storage.from("product-images").upload(newPath, dl.data, {
        upsert: true, contentType: (dl.data as Blob).type || "image/jpeg",
      });
      if (up.error) { results.push({ id: r.id, error: "upload:" + up.error.message }); continue; }
      const { data: pub } = sb.storage.from("product-images").getPublicUrl(newPath);
      const upd = await sb.from("notifications").update({ image_url: pub.publicUrl }).eq("id", r.id);
      if (upd.error) { results.push({ id: r.id, error: "update:" + upd.error.message }); continue; }
      results.push({ id: r.id, new_url: pub.publicUrl });
    }
    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

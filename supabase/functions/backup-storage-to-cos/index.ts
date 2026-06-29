// Incremental Storage mirror -> Tencent COS.
// For each Storage bucket: list files, compare ETag via HEAD on COS, upload if new/changed.
// Output layout: storage-mirror/<bucket>/<path>
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  cosHeadObject,
  cosPutObject,
  readCosConfigFromEnv,
} from "../_shared/tencentCos.ts";

const BUCKETS = [
  "product-images",
  "avatars",
  "voucher-screenshots",
  "activity-posters",
  "marketing-videos",
];

const PAGE_SIZE = 1000;
const MAX_FILES_PER_RUN = 500; // Stay under wall-clock limits; cron picks up rest next tick.
const MAX_FILE_BYTES = 200 * 1024 * 1024; // skip absurd files

async function* walk(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): AsyncGenerator<{ name: string; path: string; size: number; updated_at: string | null }> {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`列出 ${bucket}/${prefix} 失败: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      // folders have no id/metadata
      const isFolder = !item.id;
      if (isFolder) {
        yield* walk(admin, bucket, fullPath);
      } else {
        const meta = (item.metadata ?? {}) as { size?: number };
        yield {
          name: item.name,
          path: fullPath,
          size: meta.size ?? 0,
          updated_at: item.updated_at ?? null,
        };
      }
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: { trigger_source?: string; buckets?: string[] } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const trigger = body.trigger_source === "cron" ? "cron" : "manual";
  const targetBuckets = (body.buckets?.length ? body.buckets : BUCKETS).filter(Boolean);

  const { data: runRow, error: insErr } = await admin
    .from("backup_runs")
    .insert({ kind: "storage", status: "running", trigger_source: trigger })
    .select()
    .single();
  if (insErr || !runRow) {
    return new Response(JSON.stringify({ error: "无法创建备份记录: " + (insErr?.message ?? "") }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId = (runRow as { id: string }).id;

  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  const errors: string[] = [];

  try {
    const cfg = readCosConfigFromEnv();
    outer: for (const bucket of targetBuckets) {
      for await (const file of walk(admin, bucket)) {
        if (uploaded + skipped >= MAX_FILES_PER_RUN) break outer;
        if (file.size > MAX_FILE_BYTES) { skipped++; continue; }
        const cosKey = `storage-mirror/${bucket}/${file.path}`;
        try {
          const head = await cosHeadObject({ cfg, key: cosKey });
          if (head && head.size === file.size) { skipped++; continue; }
          // Download from Storage
          const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(file.path);
          if (dlErr || !blob) { errors.push(`${bucket}/${file.path}: ${dlErr?.message ?? "下载失败"}`); continue; }
          const buf = new Uint8Array(await blob.arrayBuffer());
          const { size } = await cosPutObject({
            cfg, key: cosKey, body: buf,
            contentType: blob.type || "application/octet-stream",
          });
          uploaded += 1;
          bytes += size;
        } catch (e) {
          errors.push(`${bucket}/${file.path}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    await admin.from("backup_runs").update({
      status: errors.length && uploaded === 0 ? "failed" : "success",
      finished_at: new Date().toISOString(),
      cos_key: "storage-mirror/",
      files_count: uploaded,
      total_bytes: bytes,
      error_message: errors.length ? errors.slice(0, 10).join("\n") : null,
      metadata: { uploaded, skipped, errors_total: errors.length, buckets: targetBuckets },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true, run_id: runId, uploaded, skipped, bytes, errors: errors.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("backup_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: message,
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

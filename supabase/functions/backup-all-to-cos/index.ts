// One-button full backup -> Tencent COS.
// Backs up app records as one gzip file, then mirrors uploaded files in small safe batches.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  cosHeadObject,
  cosPutObject,
  gzip,
  readCosConfigFromEnv,
} from "../_shared/tencentCos.ts";

const TABLES = [
  "activities", "activity_applications", "activity_apply_otp",
  "app_permissions", "app_role_permissions", "app_roles", "app_settings",
  "backup_runs", "claim_otp",
  "community_comments", "community_likes", "community_posts",
  "current_session", "daily_knowledge", "exp_pending",
  "guest_daily_usage", "invitations", "kb_documents",
  "knowledge_test_results",
  "marketing_assets", "marketing_character_assets", "marketing_characters",
  "marketing_presets", "marketing_video_jobs",
  "notification_reads", "notifications",
  "official_knowledge", "operation_okrs", "price_records",
  "product_knowledge", "products", "profiles",
  "shift_schedules", "shop_holidays", "shop_kb_categories",
  "shop_kb_entries", "shop_marketing_profiles", "shop_shifts", "shops",
  "sms_test_otp", "social_accounts", "social_platform_specs",
  "social_publish_jobs", "social_publish_targets",
  "spirit_conversations", "spirit_messages", "spirit_usage",
  "staff_day_offs", "staff_profiles", "task_claims",
  "user_check_ins", "user_experience", "user_favorites", "user_roles",
  "voucher_claims", "voucher_logs", "voucher_types", "vouchers",
];

const BUCKETS = [
  "product-images",
  "avatars",
  "voucher-screenshots",
  "activity-posters",
  "marketing-videos",
];

const PAGE_SIZE = 1000;
const STORAGE_FILE_LIMIT = 350;
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

async function updateRun(
  admin: ReturnType<typeof createClient>,
  runId: string,
  patch: Record<string, unknown>,
) {
  await admin.from("backup_runs").update(patch).eq("id", runId);
}

async function dumpDatabase(
  admin: ReturnType<typeof createClient>,
): Promise<{ bytes: Uint8Array; rows: number; tables: number; errors: string[] }> {
  const output: Record<string, unknown[]> = {};
  const errors: string[] = [];
  let totalRows = 0;

  for (const table of TABLES) {
    const rows: unknown[] = [];
    let from = 0;
    try {
      while (true) {
        const { data, error } = await admin
          .from(table)
          .select("*")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        totalRows += data.length;
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      output[table] = rows;
    } catch (e) {
      errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
      output[table] = [];
    }
  }

  const payload = {
    backed_up_at: new Date().toISOString(),
    format: "boomer-full-backup-v1",
    tables: output,
    table_errors: errors,
  };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  return { bytes: await gzip(raw), rows: totalRows, tables: TABLES.length, errors };
}

async function* walkStorage(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): AsyncGenerator<{ bucket: string; path: string; size: number }> {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`读取文件列表失败：${bucket}/${prefix || "根目录"}：${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        yield* walkStorage(admin, bucket, fullPath);
      } else {
        const meta = (item.metadata ?? {}) as { size?: number };
        yield { bucket, path: fullPath, size: meta.size ?? 0 };
      }
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

async function mirrorStorage(
  admin: ReturnType<typeof createClient>,
  cfg: ReturnType<typeof readCosConfigFromEnv>,
): Promise<{ uploaded: number; skipped: number; bytes: number; errors: string[]; reachedLimit: boolean }> {
  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  const errors: string[] = [];
  let reachedLimit = false;

  outer: for (const bucket of BUCKETS) {
    for await (const file of walkStorage(admin, bucket)) {
      if (uploaded + skipped >= STORAGE_FILE_LIMIT) {
        reachedLimit = true;
        break outer;
      }
      if (file.size > MAX_FILE_BYTES) {
        skipped += 1;
        continue;
      }
      const cosKey = `storage-mirror/${file.bucket}/${file.path}`;
      try {
        const head = await cosHeadObject({ cfg, key: cosKey });
        if (head && head.size === file.size) {
          skipped += 1;
          continue;
        }
        const { data: blob, error } = await admin.storage.from(file.bucket).download(file.path);
        if (error || !blob) throw new Error(error?.message || "下载文件失败");
        const buf = new Uint8Array(await blob.arrayBuffer());
        const result = await cosPutObject({
          cfg,
          key: cosKey,
          body: buf,
          contentType: blob.type || "application/octet-stream",
        });
        uploaded += 1;
        bytes += result.size;
      } catch (e) {
        errors.push(`${file.bucket}/${file.path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { uploaded, skipped, bytes, errors, reachedLimit };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "只支持备份请求" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: { trigger_source?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const trigger = body.trigger_source === "cron" ? "cron" : "manual";

  await admin.from("backup_runs").update({
    status: "failed",
    finished_at: new Date().toISOString(),
    error_message: "上一次备份被系统中断，已自动结束。请重新点“立即备份”。",
  }).eq("status", "running").lt("started_at", new Date(Date.now() - 20 * 60 * 1000).toISOString());

  const { data: runRow, error: insertError } = await admin
    .from("backup_runs")
    .insert({
      kind: "full",
      status: "running",
      trigger_source: trigger,
      metadata: { step: "开始备份" },
    })
    .select()
    .single();

  if (insertError || !runRow) {
    return json({ error: "无法创建备份记录：" + (insertError?.message ?? "未知原因") }, 500);
  }

  const runId = (runRow as { id: string }).id;
  const cfg = readCosConfigFromEnv();
  const day = todayShanghai();
  const dbKey = `db-backups/daily/${day}/full-data.json.gz`;
  const monthKey = day.endsWith("-01") ? `db-backups/monthly/${day}/full-data.json.gz` : null;

  try {
    await updateRun(admin, runId, { metadata: { step: "正在备份系统记录" } });
    const db = await dumpDatabase(admin);
    const dbUpload = await cosPutObject({
      cfg,
      key: dbKey,
      body: db.bytes,
      contentType: "application/gzip",
    });
    if (monthKey) {
      await cosPutObject({ cfg, key: monthKey, body: db.bytes, contentType: "application/gzip" });
    }

    await updateRun(admin, runId, {
      files_count: 1,
      total_bytes: dbUpload.size,
      cos_key: dbKey,
      metadata: {
        step: "正在备份图片视频",
        database_rows: db.rows,
        database_tables: db.tables,
        database_errors: db.errors.length,
      },
    });

    const storage = await mirrorStorage(admin, cfg);
    const filesCount = 1 + storage.uploaded;
    const totalBytes = dbUpload.size + storage.bytes;
    const warnings = [
      ...db.errors.slice(0, 5).map((e) => `系统记录：${e}`),
      ...storage.errors.slice(0, 5).map((e) => `图片视频：${e}`),
    ];
    if (storage.reachedLimit) {
      warnings.push("图片视频很多，本次先备份一部分；系统会在后续自动备份里继续补齐。已上传过的不会重复上传。");
    }

    await updateRun(admin, runId, {
      status: warnings.length && filesCount <= 1 ? "failed" : "success",
      finished_at: new Date().toISOString(),
      files_count: filesCount,
      total_bytes: totalBytes,
      error_message: warnings.length ? warnings.join("\n") : null,
      metadata: {
        step: "备份完成",
        database_key: dbKey,
        database_rows: db.rows,
        database_tables: db.tables,
        storage_uploaded: storage.uploaded,
        storage_skipped: storage.skipped,
        storage_errors: storage.errors.length,
        storage_reached_limit: storage.reachedLimit,
      },
    });

    return json({
      ok: true,
      run_id: runId,
      files: filesCount,
      bytes: totalBytes,
      storage_uploaded: storage.uploaded,
      storage_skipped: storage.skipped,
      has_more_files: storage.reachedLimit,
      warnings: warnings.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updateRun(admin, runId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: message,
      metadata: { step: "备份失败" },
    });
    return json({ ok: false, error: message }, 500);
  }
});
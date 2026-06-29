// One-button full backup -> Tencent COS.
// Runs in safe chunks so manual and scheduled backups do not get killed by Edge limits.
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

const PAGE_SIZE = 200;
const STORAGE_SCAN_PER_TICK = 80;
const TICK_BUDGET_MS = 25_000;
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

function currentShanghaiHour() {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  return Number(value);
}

async function updateRun(
  admin: ReturnType<typeof createClient>,
  runId: string,
  patch: Record<string, unknown>,
) {
  await admin.from("backup_runs").update(patch).eq("id", runId);
}

async function dumpTable(
  admin: ReturnType<typeof createClient>,
  table: string,
  from: number,
): Promise<{ bytes: Uint8Array; rows: number; hasMore: boolean }> {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  const rows = data ?? [];

  const payload = {
    backed_up_at: new Date().toISOString(),
    format: "boomer-table-backup-v1",
    table,
    from,
    rows,
  };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  return { bytes: await gzip(raw), rows: rows.length, hasMore: rows.length === PAGE_SIZE };
}

type RunMeta = {
  step?: string;
  phase?: "database" | "storage" | "done";
  day?: string;
  table_index?: number;
  table_offset?: number;
  database_rows?: number;
  database_files?: number;
  database_errors?: string[];
  storage_uploaded?: number;
  storage_skipped?: number;
  storage_cursor?: number;
  storage_errors?: string[];
  storage_reached_limit?: boolean;
};

function normalizeMeta(raw: unknown, day: string): RunMeta {
  const meta = raw && typeof raw === "object" ? raw as RunMeta : {};
  return {
    phase: meta.phase ?? "database",
    day: meta.day ?? day,
    table_index: meta.table_index ?? 0,
    table_offset: meta.table_offset ?? 0,
    database_rows: meta.database_rows ?? 0,
    database_files: meta.database_files ?? 0,
    database_errors: meta.database_errors ?? [],
    storage_uploaded: meta.storage_uploaded ?? 0,
    storage_skipped: meta.storage_skipped ?? 0,
    storage_cursor: meta.storage_cursor ?? 0,
    storage_errors: meta.storage_errors ?? [],
    storage_reached_limit: meta.storage_reached_limit ?? false,
    step: meta.step ?? "开始备份",
  };
}

async function getActiveRun(
  admin: ReturnType<typeof createClient>,
  trigger: "manual" | "cron",
  day: string,
): Promise<{ id: string; files_count: number; total_bytes: number; metadata: RunMeta } | null> {
  const { data: runningRows } = await admin
    .from("backup_runs")
    .select("id, started_at, files_count, total_bytes, metadata")
    .eq("kind", "full")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  const running = Array.isArray(runningRows) ? runningRows[0] : null;
  if (running) {
    const startedAt = new Date((running as { started_at: string }).started_at).getTime();
    if (Date.now() - startedAt < 2 * 60 * 60 * 1000) {
      const row = running as { id: string; files_count: number; total_bytes: number; metadata: unknown };
      return {
        id: row.id,
        files_count: row.files_count ?? 0,
        total_bytes: Number(row.total_bytes ?? 0),
        metadata: normalizeMeta(row.metadata, day),
      };
    }
    await admin.from("backup_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: "上一次备份跑得太久，已自动结束。系统会重新开始备份。",
    }).eq("id", (running as { id: string }).id);
  }

  if (trigger === "cron") {
    const { data: todaySuccess } = await admin
      .from("backup_runs")
      .select("id")
      .eq("kind", "full")
      .eq("status", "success")
      .ilike("cos_key", `%${day}%`)
      .limit(1);
    if (Array.isArray(todaySuccess) && todaySuccess.length > 0) return null;
    const hour = currentShanghaiHour();
    if (hour < 3 || hour > 4) return null;
  }

  const { data: runRow, error } = await admin
    .from("backup_runs")
    .insert({
      kind: "full",
      status: "running",
      trigger_source: trigger,
      metadata: normalizeMeta({ step: "开始备份", day }, day),
    })
    .select("id, files_count, total_bytes, metadata")
    .single();
  if (error || !runRow) throw new Error("无法创建备份记录：" + (error?.message ?? "未知原因"));
  const row = runRow as { id: string; files_count: number; total_bytes: number; metadata: unknown };
  return {
    id: row.id,
    files_count: row.files_count ?? 0,
    total_bytes: Number(row.total_bytes ?? 0),
    metadata: normalizeMeta(row.metadata, day),
  };
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

async function mirrorStorageTick(
  admin: ReturnType<typeof createClient>,
  cfg: ReturnType<typeof readCosConfigFromEnv>,
  cursor: number,
  startedAt: number,
): Promise<{ uploaded: number; skipped: number; bytes: number; errors: string[]; complete: boolean; nextCursor: number }> {
  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;
  const errors: string[] = [];

  const { data, error } = await admin
    .schema("storage")
    .from("objects")
    .select("bucket_id,name,metadata")
    .in("bucket_id", BUCKETS)
    .order("bucket_id", { ascending: true })
    .order("name", { ascending: true })
    .range(cursor, cursor + STORAGE_SCAN_PER_TICK - 1);

  if (error) throw new Error(`读取图片视频列表失败：${error.message}`);
  const files = Array.isArray(data) ? data as Array<{ bucket_id: string; name: string; metadata?: { size?: number; mimetype?: string } }> : [];
  if (files.length === 0) return { uploaded, skipped, bytes, errors, complete: true, nextCursor: cursor };

  for (const file of files) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) {
      return { uploaded, skipped, bytes, errors, complete: false, nextCursor: cursor + uploaded + skipped + errors.length };
    }
    const size = Number(file.metadata?.size ?? 0);
    if (size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const cosKey = `storage-mirror/${file.bucket_id}/${file.name}`;
    try {
      const head = await cosHeadObject({ cfg, key: cosKey });
      if (head && head.size === size) {
        skipped += 1;
        continue;
      }
      const { data: blob, error: downloadError } = await admin.storage.from(file.bucket_id).download(file.name);
      if (downloadError || !blob) throw new Error(downloadError?.message || "下载文件失败");
      const buf = new Uint8Array(await blob.arrayBuffer());
      const result = await cosPutObject({
        cfg,
        key: cosKey,
        body: buf,
        contentType: blob.type || file.metadata?.mimetype || "application/octet-stream",
      });
      uploaded += 1;
      bytes += result.size;
    } catch (e) {
      errors.push(`${file.bucket_id}/${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    uploaded,
    skipped,
    bytes,
    errors,
    complete: files.length < STORAGE_SCAN_PER_TICK,
    nextCursor: cursor + files.length,
  };
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

  const day = todayShanghai();
  const cfg = readCosConfigFromEnv();
  let currentRunId: string | null = null;

  try {
    const active = await getActiveRun(admin, trigger, day);
    if (!active) return json({ ok: true, skipped: true, message: "今天已经备份过，或还没到自动备份时间。" });

    const runId = active.id;
    currentRunId = runId;
    const meta = normalizeMeta(active.metadata, day);
    let filesCount = active.files_count;
    let totalBytes = active.total_bytes;

    if (meta.phase === "database") {
      const start = meta.table_index ?? 0;
      const offset = meta.table_offset ?? 0;
      const errors = [...(meta.database_errors ?? [])];
      let rows = meta.database_rows ?? 0;
      let dbFiles = meta.database_files ?? 0;

      const table = TABLES[start];
      let nextIndex = start;
      let nextOffset = offset;

      if (!table) {
        nextIndex = TABLES.length;
        nextOffset = 0;
      } else {
        const part = Math.floor(offset / PAGE_SIZE).toString().padStart(6, "0");
        const key = `db-backups/daily/${day}/tables/${table}/part-${part}.json.gz`;
        try {
          const dumped = await dumpTable(admin, table, offset);
          if (dumped.rows > 0 || offset === 0) {
            const uploaded = await cosPutObject({ cfg, key, body: dumped.bytes, contentType: "application/gzip" });
            if (day.endsWith("-01")) {
              await cosPutObject({
                cfg,
                key: `db-backups/monthly/${day}/tables/${table}/part-${part}.json.gz`,
                body: dumped.bytes,
                contentType: "application/gzip",
              });
            }
            dbFiles += 1;
            filesCount += 1;
            totalBytes += uploaded.size;
          }
          rows += dumped.rows;
          if (dumped.hasMore) {
            nextOffset = offset + PAGE_SIZE;
          } else {
            nextIndex = start + 1;
            nextOffset = 0;
          }
        } catch (e) {
          errors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
          nextIndex = start + 1;
          nextOffset = 0;
        }
      }

      const nextMeta: RunMeta = {
        ...meta,
        phase: nextIndex >= TABLES.length ? "storage" : "database",
        step: nextIndex >= TABLES.length ? "正在备份图片视频" : `正在备份系统记录 ${nextIndex}/${TABLES.length}`,
        table_index: nextIndex,
        table_offset: nextOffset,
        database_rows: rows,
        database_files: dbFiles,
        database_errors: errors.slice(-20),
      };
      await updateRun(admin, runId, {
        files_count: filesCount,
        total_bytes: totalBytes,
        cos_key: `db-backups/daily/${day}/`,
        error_message: errors.length ? errors.slice(0, 5).map((e) => `系统记录：${e}`).join("\n") : null,
        metadata: nextMeta,
      });

      return json({
        ok: true,
        completed: false,
        run_id: runId,
        step: nextMeta.step,
        files: filesCount,
        bytes: totalBytes,
      });
    }

    if (meta.phase === "storage") {
      const storage = await mirrorStorageTick(admin, cfg, meta.storage_cursor ?? 0, Date.now());
      const storageUploaded = (meta.storage_uploaded ?? 0) + storage.uploaded;
      const storageSkipped = (meta.storage_skipped ?? 0) + storage.skipped;
      const storageErrors = [...(meta.storage_errors ?? []), ...storage.errors].slice(-20);
      filesCount += storage.uploaded;
      totalBytes += storage.bytes;

      const complete = storage.complete;
      const nextMeta: RunMeta = {
        ...meta,
        phase: complete ? "done" : "storage",
        step: complete ? "备份完成" : "正在备份图片视频",
        storage_uploaded: storageUploaded,
        storage_skipped: storageSkipped,
        storage_cursor: storage.nextCursor,
        storage_errors: storageErrors,
        storage_reached_limit: !complete,
      };

      await updateRun(admin, runId, {
        status: complete ? "success" : "running",
        finished_at: complete ? new Date().toISOString() : null,
        files_count: filesCount,
        total_bytes: totalBytes,
        error_message: storageErrors.length ? storageErrors.slice(0, 5).map((e) => `图片视频：${e}`).join("\n") : null,
        metadata: nextMeta,
      });

      return json({
        ok: true,
        completed: complete,
        run_id: runId,
        step: nextMeta.step,
        files: filesCount,
        bytes: totalBytes,
        storage_uploaded: storageUploaded,
        storage_skipped: storageSkipped,
        has_more_files: !complete,
      });
    }

    await updateRun(admin, runId, {
      status: "success",
      finished_at: new Date().toISOString(),
      metadata: { ...meta, step: "备份完成", phase: "done", storage_reached_limit: false },
    });
    return json({ ok: true, completed: true, run_id: runId, files: filesCount, bytes: totalBytes });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (currentRunId) {
      await updateRun(admin, currentRunId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
        metadata: { step: "备份失败" },
      });
    }
    return json({ ok: false, error: message }, 500);
  }
});
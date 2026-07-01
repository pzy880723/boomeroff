// One-button full backup -> Tencent COS.
// Loops as much as possible within one Edge tick, then self-continues via
// EdgeRuntime.waitUntil so the run finishes even if the browser tab is closed.
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
const STORAGE_LIST_PAGE = 200;
const TICK_BUDGET_MS = 40_000;
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

function humanize(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("schema must be one of")) {
    return "备份程序权限不足（无法访问 storage schema），请联系开发者更新。";
  }
  if (m.includes("signature") || m.includes("403") || m.includes("accessdenied")) {
    return "腾讯云拒绝写入，密钥可能过期或权限被改。请重新生成腾讯云密钥。";
  }
  if (m.includes("nosuchbucket")) {
    return "腾讯云存储桶不存在，请到腾讯云控制台确认。";
  }
  return msg;
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

type StorageFile = { bucket: string; path: string; size: number; mime?: string };

async function listBucketRecursive(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
  out: StorageFile[] = [],
): Promise<StorageFile[]> {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`读取 ${bucket}/${prefix || "根目录"} 失败：${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        await listBucketRecursive(admin, bucket, fullPath, out);
      } else {
        const meta = (item.metadata ?? {}) as { size?: number; mimetype?: string };
        out.push({ bucket, path: fullPath, size: meta.size ?? 0, mime: meta.mimetype });
      }
    }
    if (data.length < STORAGE_LIST_PAGE) break;
    offset += STORAGE_LIST_PAGE;
  }
  return out;
}

type RunMeta = {
  step?: string;
  phase?: "database" | "storage_list" | "storage" | "done";
  day?: string;
  table_index?: number;
  table_offset?: number;
  database_rows?: number;
  database_files?: number;
  database_errors?: string[];
  storage_bucket_index?: number;
  storage_manifest_key?: string;
  storage_total?: number;
  storage_uploaded?: number;
  storage_skipped?: number;
  storage_cursor?: number;
  storage_errors?: string[];
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
    storage_bucket_index: meta.storage_bucket_index ?? 0,
    storage_manifest_key: meta.storage_manifest_key,
    storage_total: meta.storage_total ?? 0,
    storage_uploaded: meta.storage_uploaded ?? 0,
    storage_skipped: meta.storage_skipped ?? 0,
    storage_cursor: meta.storage_cursor ?? 0,
    storage_errors: meta.storage_errors ?? [],
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

// Trigger self next tick (best-effort). Won't throw.
function scheduleContinuation(reqUrl: string) {
  try {
    const url = new URL(reqUrl);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    const p = fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ trigger_source: "self" }),
    }).catch(() => {});
    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
  } catch { /* ignore */ }
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
  const rawTrigger = body.trigger_source;
  const trigger: "manual" | "cron" = rawTrigger === "cron" ? "cron" : "manual";
  // "self" continuations behave like manual for scheduling but never create a new run.

  const day = todayShanghai();
  let cfg: ReturnType<typeof readCosConfigFromEnv>;
  try {
    cfg = readCosConfigFromEnv();
  } catch (e) {
    return json({ ok: false, error: humanize(e instanceof Error ? e.message : String(e)) }, 500);
  }

  let currentRunId: string | null = null;
  const tickStart = Date.now();

  try {
    const active = await getActiveRun(admin, trigger, day);
    if (!active) return json({ ok: true, skipped: true, message: "今天已经备份过，或还没到自动备份时间。" });

    const runId = active.id;
    currentRunId = runId;
    let meta = normalizeMeta(active.metadata, day);
    let filesCount = active.files_count;
    let totalBytes = active.total_bytes;

    // ============= DATABASE PHASE =============
    while (meta.phase === "database" && Date.now() - tickStart < TICK_BUDGET_MS) {
      const start = meta.table_index ?? 0;
      if (start >= TABLES.length) {
        meta.phase = "storage_list";
        meta.step = "正在扫描图片和视频";
        break;
      }
      const table = TABLES[start];
      const offset = meta.table_offset ?? 0;
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
          meta.database_files = (meta.database_files ?? 0) + 1;
          filesCount += 1;
          totalBytes += uploaded.size;
        }
        meta.database_rows = (meta.database_rows ?? 0) + dumped.rows;
        if (dumped.hasMore) {
          meta.table_offset = offset + PAGE_SIZE;
        } else {
          meta.table_index = start + 1;
          meta.table_offset = 0;
        }
        meta.step = `正在备份系统记录 ${meta.table_index}/${TABLES.length}`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        meta.database_errors = [...(meta.database_errors ?? []), `${table}: ${msg}`].slice(-20);
        meta.table_index = start + 1;
        meta.table_offset = 0;
      }
    }

    // ============= STORAGE LIST PHASE =============
    if (meta.phase === "storage_list" && Date.now() - tickStart < TICK_BUDGET_MS) {
      const bucketIdx = meta.storage_bucket_index ?? 0;
      if (bucketIdx >= BUCKETS.length) {
        meta.phase = "storage";
      } else {
        try {
          // Build/append a per-day manifest of files to upload.
          const bucket = BUCKETS[bucketIdx];
          const files = await listBucketRecursive(admin, bucket);
          const manifestKey = `db-backups/daily/${day}/_manifest/${String(bucketIdx).padStart(2, "0")}-${bucket}.json.gz`;
          const raw = new TextEncoder().encode(JSON.stringify(files));
          await cosPutObject({ cfg, key: manifestKey, body: await gzip(raw), contentType: "application/gzip" });
          meta.storage_total = (meta.storage_total ?? 0) + files.length;
          meta.storage_bucket_index = bucketIdx + 1;
          meta.step = `正在扫描图片和视频 (${meta.storage_bucket_index}/${BUCKETS.length})`;
          if (meta.storage_bucket_index >= BUCKETS.length) {
            meta.phase = "storage";
            meta.storage_cursor = 0;
            meta.step = "正在上传图片和视频";
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          meta.storage_errors = [...(meta.storage_errors ?? []), `扫描 ${BUCKETS[bucketIdx]}: ${msg}`].slice(-20);
          meta.storage_bucket_index = bucketIdx + 1;
          if (meta.storage_bucket_index >= BUCKETS.length) {
            meta.phase = "storage";
            meta.storage_cursor = 0;
          }
        }
      }
    }

    // ============= STORAGE UPLOAD PHASE =============
    // Walk through per-bucket manifests we produced above, respecting the tick budget.
    if (meta.phase === "storage" && Date.now() - tickStart < TICK_BUDGET_MS) {
      // Load all manifests up-front once — they are small (~ path list).
      const manifests: StorageFile[] = [];
      for (let i = 0; i < BUCKETS.length; i++) {
        try {
          const bucket = BUCKETS[i];
          const key = `db-backups/daily/${day}/_manifest/${String(i).padStart(2, "0")}-${bucket}.json.gz`;
          const auth = await import("../_shared/tencentCos.ts").then((m) => m.signCos({
            cfg, method: "GET", pathname: `/${encodeURI(key).replace(/%2F/g, "/")}`,
          }));
          const url = `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com/${encodeURI(key).replace(/%2F/g, "/")}`;
          const resp = await fetch(url, { headers: { Authorization: auth } });
          if (!resp.ok) continue;
          const gz = new Uint8Array(await resp.arrayBuffer());
          const ds = new DecompressionStream("gzip");
          const stream = new Blob([gz as unknown as BlobPart]).stream().pipeThrough(ds);
          const buf = new Uint8Array(await new Response(stream).arrayBuffer());
          const arr = JSON.parse(new TextDecoder().decode(buf)) as StorageFile[];
          manifests.push(...arr);
        } catch { /* ignore missing/broken manifest — that bucket will just be skipped this run */ }
      }

      let cursor = meta.storage_cursor ?? 0;
      let uploaded = meta.storage_uploaded ?? 0;
      let skipped = meta.storage_skipped ?? 0;
      const errors = [...(meta.storage_errors ?? [])];

      while (cursor < manifests.length && Date.now() - tickStart < TICK_BUDGET_MS) {
        const file = manifests[cursor];
        cursor += 1;
        if (!file || file.size > MAX_FILE_BYTES) { skipped += 1; continue; }
        const cosKey = `storage-mirror/${file.bucket}/${file.path}`;
        try {
          const head = await cosHeadObject({ cfg, key: cosKey });
          if (head && head.size === file.size) { skipped += 1; continue; }
          const { data: blob, error: dlErr } = await admin.storage.from(file.bucket).download(file.path);
          if (dlErr || !blob) throw new Error(dlErr?.message || "下载文件失败");
          const buf = new Uint8Array(await blob.arrayBuffer());
          const result = await cosPutObject({
            cfg, key: cosKey, body: buf,
            contentType: blob.type || file.mime || "application/octet-stream",
          });
          uploaded += 1;
          filesCount += 1;
          totalBytes += result.size;
        } catch (e) {
          errors.push(`${file.bucket}/${file.path}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      meta.storage_cursor = cursor;
      meta.storage_uploaded = uploaded;
      meta.storage_skipped = skipped;
      meta.storage_errors = errors.slice(-20);
      if (cursor >= manifests.length && manifests.length > 0) {
        meta.phase = "done";
        meta.step = "备份完成";
      } else {
        meta.step = `正在上传图片和视频 ${cursor}/${manifests.length || meta.storage_total}`;
      }
      if (manifests.length === 0 && (meta.storage_total ?? 0) === 0) {
        // Nothing to mirror — done.
        meta.phase = "done";
        meta.step = "备份完成";
      }
    }

    const finished = meta.phase === "done";
    await updateRun(admin, runId, {
      status: finished ? "success" : "running",
      finished_at: finished ? new Date().toISOString() : null,
      files_count: filesCount,
      total_bytes: totalBytes,
      cos_key: `db-backups/daily/${day}/`,
      error_message:
        (meta.database_errors?.length || meta.storage_errors?.length)
          ? [
              ...(meta.database_errors ?? []).slice(0, 3).map((e) => `系统记录：${humanize(e)}`),
              ...(meta.storage_errors ?? []).slice(0, 3).map((e) => `图片视频：${humanize(e)}`),
            ].join("\n")
          : null,
      metadata: meta,
    });

    // Self-continue until done — page can be closed, function keeps running.
    if (!finished) scheduleContinuation(req.url);

    return json({
      ok: true,
      completed: finished,
      run_id: runId,
      step: meta.step,
      files: filesCount,
      bytes: totalBytes,
      phase: meta.phase,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (currentRunId) {
      await updateRun(admin, currentRunId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: humanize(message),
        metadata: { step: "备份失败" },
      });
    }
    return json({ ok: false, error: humanize(message) }, 500);
  }
});

// One-button full backup -> Tencent COS with:
//  - per-pass stats (database / images / videos)
//  - structured failure list
//  - run-manifest.json.gz with ETag/size for external verification
//  - automatic reconcile after done
//  - "retry_failed" and "reconcile_only" actions
//  - broadcast notification (public.notifications) on completion
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  cosHeadObject,
  cosListPrefix,
  cosPutObject,
  gzip,
  readCosConfigFromEnv,
  signCos,
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
const TICK_BUDGET_MS = 45_000;
const TICK_SAFETY_MS = 5_000;
const MIN_UPLOAD_WINDOW_MS = 4_000;
const LARGE_FILE_THRESHOLD = 30 * 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FAILURES = 500;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function todayShanghai() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function currentShanghaiHour() {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", hour: "2-digit", hour12: false,
  }).format(new Date());
  return Number(value);
}

function humanize(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("schema must be one of")) return "备份程序权限不足（无法访问 storage schema），请联系开发者更新。";
  if (m.includes("signature") || m.includes("403") || m.includes("accessdenied")) return "腾讯云拒绝写入，密钥可能过期或权限被改。请重新生成腾讯云密钥。";
  if (m.includes("nosuchbucket")) return "腾讯云存储桶不存在，请到腾讯云控制台确认。";
  if (m.includes("本轮执行时间不够") || m.includes("等待超过")) return "上传腾讯云等待过久，系统正在分批补传；通常不用去腾讯云开按钮。";
  if (m.includes("timeout") || m.includes("timed out") || m.includes("aborted")) return "上传腾讯云超时，系统会分批补传；如果连续多次失败，再检查腾讯云密钥和桶权限。";
  return msg;
}

type PassKey = "database" | "storage_pass1" | "storage_pass2";
type PassStat = {
  uploaded: number;
  failed: number;
  skipped: number;
  bytes: number;
  elapsed_ms: number;
  total?: number;
};
type FailureItem = {
  kind: "table" | "storage";
  bucket?: string;
  path?: string;
  table?: string;
  offset?: number;
  size?: number;
  error: string;
  attempts: number;
  first_failed_at: string;
  last_failed_at: string;
};

type ManifestEntry = { kind: "table" | "storage"; key: string; size: number; etag: string; bucket?: string; path?: string; table?: string };

type RunMeta = {
  step?: string;
  phase?: "database" | "storage_list" | "storage" | "finalize" | "done";
  day?: string;
  table_index?: number;
  table_offset?: number;
  database_rows?: number;
  database_files?: number;
  storage_bucket_index?: number;
  storage_total?: number;
  storage_uploaded?: number;
  storage_skipped?: number;
  storage_cursor?: number;
  storage_pass?: 1 | 2;
  storage_deferred?: number;
  storage_reached_limit?: boolean;
  last_tick_at?: string;
  pass_stats?: Partial<Record<PassKey, PassStat>>;
  failures?: FailureItem[];
  manifest?: ManifestEntry[]; // running list of successfully uploaded objects
  manifest_key?: string;
  reconcile?: {
    ran_at: string;
    tables_expected: number;
    tables_present: number;
    tables_missing: string[];
    storage_expected: number;
    storage_present: number;
    storage_missing: Array<{ bucket: string; path: string }>;
    ok: boolean;
  };
  notified?: boolean;
  retry_of?: string;
  retry_queue?: Array<{ bucket: string; path: string; size?: number }>;
  retry_cursor?: number;
};

function defaultStat(): PassStat { return { uploaded: 0, failed: 0, skipped: 0, bytes: 0, elapsed_ms: 0 }; }

function normalizeMeta(raw: unknown, day: string): RunMeta {
  const meta = raw && typeof raw === "object" ? raw as RunMeta : {};
  return {
    ...meta,
    phase: meta.phase ?? "database",
    day: meta.day ?? day,
    table_index: meta.table_index ?? 0,
    table_offset: meta.table_offset ?? 0,
    database_rows: meta.database_rows ?? 0,
    database_files: meta.database_files ?? 0,
    storage_bucket_index: meta.storage_bucket_index ?? 0,
    storage_total: meta.storage_total ?? 0,
    storage_uploaded: meta.storage_uploaded ?? 0,
    storage_skipped: meta.storage_skipped ?? 0,
    storage_cursor: meta.storage_cursor ?? 0,
    storage_pass: (meta.storage_pass === 2 ? 2 : 1),
    storage_deferred: meta.storage_deferred ?? 0,
    step: meta.step ?? "开始备份",
    last_tick_at: meta.last_tick_at,
    pass_stats: {
      database: meta.pass_stats?.database ?? defaultStat(),
      storage_pass1: meta.pass_stats?.storage_pass1 ?? defaultStat(),
      storage_pass2: meta.pass_stats?.storage_pass2 ?? defaultStat(),
    },
    failures: Array.isArray(meta.failures) ? meta.failures : [],
    manifest: Array.isArray(meta.manifest) ? meta.manifest : [],
    manifest_key: meta.manifest_key,
    reconcile: meta.reconcile,
    notified: meta.notified ?? false,
    retry_of: meta.retry_of,
    retry_queue: meta.retry_queue,
    retry_cursor: meta.retry_cursor,
  };
}

function recordFailure(meta: RunMeta, item: Omit<FailureItem, "attempts" | "first_failed_at" | "last_failed_at">) {
  const now = new Date().toISOString();
  const key = item.kind === "table" ? `t:${item.table}:${item.offset}` : `s:${item.bucket}/${item.path}`;
  const arr = meta.failures ?? [];
  const idx = arr.findIndex((f) => (f.kind === "table" ? `t:${f.table}:${f.offset}` : `s:${f.bucket}/${f.path}`) === key);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...item, attempts: arr[idx].attempts + 1, last_failed_at: now, error: humanize(item.error) };
  } else {
    arr.push({ ...item, error: humanize(item.error), attempts: 1, first_failed_at: now, last_failed_at: now });
  }
  meta.failures = arr.slice(-MAX_FAILURES);
}

function removeFailure(meta: RunMeta, matcher: (f: FailureItem) => boolean) {
  meta.failures = (meta.failures ?? []).filter((f) => !matcher(f));
}

function bumpPass(meta: RunMeta, key: PassKey, patch: Partial<PassStat>) {
  const stats = meta.pass_stats ?? {};
  const cur = stats[key] ?? defaultStat();
  stats[key] = {
    uploaded: cur.uploaded + (patch.uploaded ?? 0),
    failed: cur.failed + (patch.failed ?? 0),
    skipped: cur.skipped + (patch.skipped ?? 0),
    bytes: cur.bytes + (patch.bytes ?? 0),
    elapsed_ms: cur.elapsed_ms + (patch.elapsed_ms ?? 0),
    total: patch.total ?? cur.total,
  };
  meta.pass_stats = stats;
}

function remainingTickMs(tickStart: number) {
  return TICK_BUDGET_MS - (Date.now() - tickStart) - TICK_SAFETY_MS;
}

function hasUploadWindow(tickStart: number) {
  return remainingTickMs(tickStart) >= MIN_UPLOAD_WINDOW_MS;
}

function cosPutBudget(tickStart: number, size = 0, large = false) {
  const remaining = Math.max(MIN_UPLOAD_WINDOW_MS, remainingTickMs(tickStart));
  const desired = large
    ? Math.min(70_000, Math.max(20_000, Math.round(size / (1024 * 1024)) * 2_000))
    : Math.min(12_000, Math.max(6_000, 5_000 + Math.round(size / (512 * 1024)) * 1_000));
  return {
    maxAttempts: large ? 2 : 1,
    perAttemptTimeoutMs: Math.max(MIN_UPLOAD_WINDOW_MS, Math.min(desired, remaining)),
  };
}

async function updateRun(admin: ReturnType<typeof createClient>, runId: string, patch: Record<string, unknown>) {
  await admin.from("backup_runs").update(patch).eq("id", runId);
}

// ============= Persistent ledger helpers =============
// Truth source for "已成功备份" across runs. Populated from backup_file_ledger.
// Key format for source_bucket:
//   "storage:<bucket>"  — a file from Supabase Storage
//   "db:<table>"        — a per-page table dump
type LedgerEntry = { size: number; cos_key: string; etag?: string };

async function loadLedger(admin: ReturnType<typeof createClient>, sourceBucket: string): Promise<Map<string, LedgerEntry>> {
  const out = new Map<string, LedgerEntry>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("backup_file_ledger")
      .select("source_path, size, cos_key, etag")
      .eq("source_bucket", sourceBucket)
      .range(from, from + pageSize - 1);
    if (error) break;
    const rows = (data ?? []) as Array<{ source_path: string; size: number; cos_key: string; etag: string | null }>;
    for (const r of rows) out.set(r.source_path, { size: Number(r.size ?? 0), cos_key: r.cos_key, etag: r.etag ?? undefined });
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function ledgerUpsertBatch(
  admin: ReturnType<typeof createClient>,
  rows: Array<{ cos_key: string; source_bucket: string; source_path: string; size: number; etag?: string }>,
) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const payload = rows.map((r) => ({
    cos_key: r.cos_key,
    source_bucket: r.source_bucket,
    source_path: r.source_path,
    size: r.size,
    etag: r.etag ?? null,
    last_verified_at: now,
  }));
  try {
    await admin.from("backup_file_ledger").upsert(payload, { onConflict: "cos_key" });
  } catch { /* non-fatal */ }
}

async function markFailure(
  admin: ReturnType<typeof createClient>,
  entry: { source_bucket: string; source_path: string; cos_key: string; size: number; error: string },
) {
  try {
    const { data } = await admin
      .from("backup_file_failures")
      .select("id, attempt_count")
      .eq("source_bucket", entry.source_bucket)
      .eq("source_path", entry.source_path)
      .maybeSingle();
    if (data) {
      await admin.from("backup_file_failures").update({
        cos_key: entry.cos_key,
        size: entry.size,
        error_message: entry.error,
        attempt_count: ((data as { attempt_count: number }).attempt_count ?? 1) + 1,
        last_attempt_at: new Date().toISOString(),
        resolved_at: null,
      }).eq("id", (data as { id: string }).id);
    } else {
      await admin.from("backup_file_failures").insert({
        source_bucket: entry.source_bucket,
        source_path: entry.source_path,
        cos_key: entry.cos_key,
        size: entry.size,
        error_message: entry.error,
      });
    }
  } catch { /* non-fatal */ }
}

async function markResolved(
  admin: ReturnType<typeof createClient>,
  source_bucket: string,
  source_path: string,
) {
  try {
    await admin.from("backup_file_failures")
      .update({ resolved_at: new Date().toISOString() })
      .eq("source_bucket", source_bucket)
      .eq("source_path", source_path)
      .is("resolved_at", null);
  } catch { /* non-fatal */ }
}

async function dumpTable(admin: ReturnType<typeof createClient>, table: string, from: number) {
  const { data, error } = await admin.from(table).select("*").range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  const rows = data ?? [];
  const payload = { backed_up_at: new Date().toISOString(), format: "boomer-table-backup-v1", table, from, rows };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  return { bytes: await gzip(raw), rows: rows.length, hasMore: rows.length === PAGE_SIZE };
}

type StorageFile = { bucket: string; path: string; size: number; mime?: string };

async function listBucketRecursive(admin: ReturnType<typeof createClient>, bucket: string, prefix = "", out: StorageFile[] = []): Promise<StorageFile[]> {
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: STORAGE_LIST_PAGE, offset, sortBy: { column: "name", order: "asc" },
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

async function loadBucketManifests(cfg: ReturnType<typeof readCosConfigFromEnv>, day: string): Promise<StorageFile[]> {
  const out: StorageFile[] = [];
  for (let i = 0; i < BUCKETS.length; i++) {
    try {
      const bucket = BUCKETS[i];
      const key = `db-backups/daily/${day}/_manifest/${String(i).padStart(2, "0")}-${bucket}.json.gz`;
      const pathname = `/${encodeURI(key).replace(/%2F/g, "/")}`;
      const auth = await signCos({ cfg, method: "GET", pathname });
      const url = `https://${cfg.bucket}.cos.${cfg.region}.myqcloud.com${pathname}`;
      const resp = await fetch(url, { headers: { Authorization: auth } });
      if (!resp.ok) continue;
      const gz = new Uint8Array(await resp.arrayBuffer());
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([gz as unknown as BlobPart]).stream().pipeThrough(ds);
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      out.push(...(JSON.parse(new TextDecoder().decode(buf)) as StorageFile[]));
    } catch { /* ignore */ }
  }
  return out;
}

async function finalizeManifestAndReconcile(
  admin: ReturnType<typeof createClient>,
  cfg: ReturnType<typeof readCosConfigFromEnv>,
  runId: string,
  meta: RunMeta,
  day: string,
) {
  // 1) upload run-manifest
  const manifestBody = {
    format: "boomer-run-manifest-v1",
    run_id: runId,
    day,
    generated_at: new Date().toISOString(),
    totals: {
      files: meta.manifest?.length ?? 0,
      bytes: (meta.manifest ?? []).reduce((s, m) => s + (m.size || 0), 0),
    },
    pass_stats: meta.pass_stats,
    entries: meta.manifest ?? [],
    failures: meta.failures ?? [],
  };
  const key = `db-backups/daily/${day}/_run-manifest-${runId}.json.gz`;
  try {
    const raw = new TextEncoder().encode(JSON.stringify(manifestBody));
    await cosPutObject({ cfg, key, body: await gzip(raw), contentType: "application/gzip" });
    meta.manifest_key = key;
  } catch (e) {
    recordFailure(meta, { kind: "storage", bucket: "_manifest", path: key, error: e instanceof Error ? e.message : String(e) });
  }

  // 2) reconcile — cross-check against source manifests
  try {
    const src = await loadBucketManifests(cfg, day);
    const eligible = src.filter((f) => (f.size ?? 0) <= MAX_FILE_BYTES);
    const uploadedSet = new Set((meta.manifest ?? []).filter((m) => m.kind === "storage").map((m) => `${m.bucket}/${m.path}`));
    const missing: Array<{ bucket: string; path: string }> = [];
    for (const f of eligible) {
      const id = `${f.bucket}/${f.path}`;
      if (uploadedSet.has(id)) continue;
      // If not in manifest, do a HEAD to see if a previous run put it there.
      try {
        const head = await cosHeadObject({ cfg, key: `storage-mirror/${f.bucket}/${f.path}` });
        if (head && head.size === f.size) continue;
      } catch { /* treat as missing */ }
      missing.push({ bucket: f.bucket, path: f.path });
      // seed failures for retry_failed
      recordFailure(meta, { kind: "storage", bucket: f.bucket, path: f.path, size: f.size, error: "对账发现缺失" });
    }
    const tablesUploaded = new Set((meta.manifest ?? []).filter((m) => m.kind === "table").map((m) => m.table!));
    const tablesMissing = TABLES.filter((t) => !tablesUploaded.has(t));
    meta.reconcile = {
      ran_at: new Date().toISOString(),
      tables_expected: TABLES.length,
      tables_present: TABLES.length - tablesMissing.length,
      tables_missing: tablesMissing,
      storage_expected: eligible.length,
      storage_present: eligible.length - missing.length,
      storage_missing: missing.slice(0, 200),
      ok: missing.length === 0 && tablesMissing.length === 0,
    };
  } catch (e) {
    meta.reconcile = {
      ran_at: new Date().toISOString(),
      tables_expected: TABLES.length, tables_present: 0, tables_missing: [],
      storage_expected: 0, storage_present: 0, storage_missing: [],
      ok: false,
    };
    recordFailure(meta, { kind: "storage", bucket: "_reconcile", path: "-", error: e instanceof Error ? e.message : String(e) });
  }
}

async function sendCompletionNotification(admin: ReturnType<typeof createClient>, runId: string, meta: RunMeta, filesCount: number, elapsedMs: number, triggerBy?: string) {
  if (meta.notified) return;
  const failed = meta.failures?.length ?? 0;
  const success = Math.max(0, filesCount - failed);
  const rate = filesCount > 0 ? Math.round((success / (success + failed)) * 100) : 100;
  const mins = Math.max(1, Math.round(elapsedMs / 60_000));
  const okAll = meta.reconcile?.ok !== false && failed === 0;
  const title = okAll ? `备份成功 ✓ 成功率 ${rate}%` : `备份完成但有失败 ⚠ 成功率 ${rate}%`;
  const topErrors = (meta.failures ?? []).slice(0, 3).map((f) => `· ${(f.bucket ?? f.table) || ""}${f.path ? "/" + f.path : ""}：${f.error}`).join("\n");
  const body = [
    `文件 ${filesCount} · 失败 ${failed} · 耗时约 ${mins} 分钟`,
    meta.reconcile ? `对账：表 ${meta.reconcile.tables_present}/${meta.reconcile.tables_expected}，文件 ${meta.reconcile.storage_present}/${meta.reconcile.storage_expected}` : "",
    topErrors ? `失败原因：\n${topErrors}` : "",
  ].filter(Boolean).join("\n");
  try {
    await admin.from("notifications").insert({
      title, body, type: "backup",
      created_by: triggerBy ?? null,
      active: true,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    meta.notified = true;
  } catch { /* non-fatal */ }
}

async function getActiveRun(admin: ReturnType<typeof createClient>, trigger: "manual" | "cron", day: string) {
  const { data: runningRows } = await admin
    .from("backup_runs").select("id, started_at, files_count, total_bytes, metadata")
    .eq("kind", "full").eq("status", "running")
    .order("started_at", { ascending: false }).limit(1);
  const running = Array.isArray(runningRows) ? runningRows[0] : null;
  if (running) {
    await admin.from("backup_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: "已停止重复备份任务：系统只保留最新一轮继续运行。",
    }).eq("kind", "full").eq("status", "running").neq("id", (running as { id: string }).id);
  }
  if (running) {
    const row = running as { id: string; started_at: string; files_count: number; total_bytes: number; metadata: unknown };
    const meta = normalizeMeta(row.metadata, day);
    const heartbeatAt = meta.last_tick_at ? new Date(meta.last_tick_at).getTime() : new Date(row.started_at).getTime();
    const staleMs = Date.now() - heartbeatAt;
    const overallAgeMs = Date.now() - new Date(row.started_at).getTime();
    if (staleMs < 20 * 60 * 1000 && overallAgeMs < 6 * 60 * 60 * 1000) {
      return { id: row.id, files_count: row.files_count ?? 0, total_bytes: Number(row.total_bytes ?? 0), metadata: meta };
    }
    await admin.from("backup_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: "上一次备份长时间没有推进，已自动结束。",
    }).eq("id", row.id);
  }
  if (trigger === "cron") {
    const { data: todaySuccess } = await admin.from("backup_runs")
      .select("id").eq("kind", "full").eq("status", "success").ilike("cos_key", `%${day}%`).limit(1);
    if (Array.isArray(todaySuccess) && todaySuccess.length > 0) return null;
    const hour = currentShanghaiHour();
    if (hour < 3 || hour > 4) return null;
  }
  const { data: runRow, error } = await admin.from("backup_runs")
    .insert({ kind: "full", status: "running", trigger_source: trigger, metadata: normalizeMeta({ step: "开始备份", day }, day) })
    .select("id, files_count, total_bytes, metadata").single();
  if (error || !runRow) throw new Error("无法创建备份记录：" + (error?.message ?? "未知原因"));
  const row = runRow as { id: string; files_count: number; total_bytes: number; metadata: unknown };
  return { id: row.id, files_count: row.files_count ?? 0, total_bytes: Number(row.total_bytes ?? 0), metadata: normalizeMeta(row.metadata, day) };
}

function scheduleContinuation(reqUrl: string) {
  try {
    const url = new URL(reqUrl);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    const p = fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
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

  let body: { trigger_source?: string; action?: string; run_id?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const rawTrigger = body.trigger_source;
  const trigger: "manual" | "cron" = rawTrigger === "cron" ? "cron" : "manual";
  const action = body.action ?? "run";

  const day = todayShanghai();
  let cfg: ReturnType<typeof readCosConfigFromEnv>;
  try { cfg = readCosConfigFromEnv(); }
  catch (e) { return json({ ok: false, error: humanize(e instanceof Error ? e.message : String(e)) }, 500); }

  // triggering user (best-effort — for created_by on the notification)
  let triggerBy: string | undefined;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader && rawTrigger !== "self" && rawTrigger !== "cron") {
      const user = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
      triggerBy = user.data.user?.id;
    }
  } catch { /* ignore */ }

  // ========== cancel / restart / retry / reconcile ==========
  if (action === "cancel_running" || action === "start_fresh") {
    const stoppedAt = new Date().toISOString();
    await admin.from("backup_runs").update({
      status: "failed",
      finished_at: stoppedAt,
      error_message: action === "start_fresh"
        ? "已停止旧备份，并重新开始一轮干净备份。"
        : "已手动停止备份。",
      metadata: {
        step: action === "start_fresh" ? "已停止旧备份，准备重新开始" : "已手动停止",
        phase: "done",
        stopped_at: stoppedAt,
      },
    }).eq("kind", "full").eq("status", "running");

    if (action === "cancel_running") {
      return json({ ok: true, stopped: true });
    }

    const { data: runRow, error } = await admin.from("backup_runs")
      .insert({ kind: "full", status: "running", trigger_source: trigger, metadata: normalizeMeta({ step: "开始备份", day }, day) })
      .select("id").single();
    if (error || !runRow) return json({ ok: false, error: "无法创建新的备份记录：" + (error?.message ?? "未知原因") }, 500);
    scheduleContinuation(req.url);
    return json({ ok: true, restarted: true, run_id: (runRow as { id: string }).id }, 202);
  }

  if (action === "retry_failed" && body.run_id) {
    const { data: srcRow } = await admin.from("backup_runs").select("id, metadata").eq("id", body.run_id).maybeSingle();
    if (!srcRow) return json({ ok: false, error: "找不到那次备份记录" }, 404);
    const srcMeta = normalizeMeta((srcRow as { metadata: unknown }).metadata, day);
    const queue = (srcMeta.failures ?? [])
      .filter((f) => f.kind === "storage" && f.bucket && f.path)
      .map((f) => ({ bucket: f.bucket!, path: f.path!, size: f.size }));
    if (queue.length === 0) return json({ ok: false, error: "上一次没有失败的文件可以补" }, 400);
    const newMeta: RunMeta = normalizeMeta({
      step: `只重试失败文件（共 ${queue.length} 个）`,
      day, phase: "storage",
      retry_of: body.run_id, retry_queue: queue, retry_cursor: 0,
      // Skip listing — retry mode consumes queue directly.
      storage_bucket_index: BUCKETS.length,
      storage_pass: 2, // treat as pass2 so both pass stats stay distinct
    }, day);
    // Also mark table_index at end so DB phase is skipped.
    newMeta.table_index = TABLES.length;
    newMeta.phase = "storage";
    const { data: newRow, error } = await admin.from("backup_runs").insert({
      kind: "full", status: "running", trigger_source: "manual",
      metadata: newMeta, retry_of: body.run_id,
    }).select("id").single();
    if (error) return json({ ok: false, error: error.message }, 500);
    scheduleContinuation(req.url);
    return json({ ok: true, run_id: (newRow as { id: string }).id, queued: queue.length });
  }

  if (action === "reconcile_only" && body.run_id) {
    const { data: srcRow } = await admin.from("backup_runs").select("id, metadata, started_at").eq("id", body.run_id).maybeSingle();
    if (!srcRow) return json({ ok: false, error: "找不到那次备份记录" }, 404);
    const runDay = (srcRow as { started_at: string }).started_at.slice(0, 10);
    const meta = normalizeMeta((srcRow as { metadata: unknown }).metadata, runDay);
    await finalizeManifestAndReconcile(admin, cfg, body.run_id, meta, runDay);
    await updateRun(admin, body.run_id, { metadata: meta });
    return json({ ok: true, reconcile: meta.reconcile });
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

    // Bulk index of what's already in COS under storage-mirror/<bucket>/.
    // Built lazily on demand so we pay ~1 list call per bucket per tick
    // instead of one HEAD per file (which is what made backups feel endless).
    const mirrorIndexCache = new Map<string, Map<string, { size: number; etag: string }>>();
    async function getMirrorIndex(bucket: string) {
      const cached = mirrorIndexCache.get(bucket);
      if (cached) return cached;
      try {
        const idx = await cosListPrefix({ cfg, prefix: `storage-mirror/${bucket}/`, timeoutMs: 20_000 });
        mirrorIndexCache.set(bucket, idx);
        return idx;
      } catch {
        const empty = new Map<string, { size: number; etag: string }>();
        mirrorIndexCache.set(bucket, empty);
        return empty;
      }
    }

    // ============= RETRY QUEUE PHASE (new) =============
    if (meta.retry_queue && meta.phase === "storage") {
      const queue = meta.retry_queue;
      let cursor = meta.retry_cursor ?? 0;
      const passStart = Date.now();
      let uploaded = 0, failed = 0, bytes = 0;
      while (cursor < queue.length && hasUploadWindow(tickStart)) {
        const f = queue[cursor++];
        const cosKey = `storage-mirror/${f.bucket}/${f.path}`;
        try {
          const idx = await getMirrorIndex(f.bucket);
          const existing = idx.get(cosKey);
          if (existing && (!f.size || existing.size === f.size)) {
            uploaded++;
            (meta.manifest ??= []).push({ kind: "storage", key: cosKey, size: existing.size, etag: existing.etag, bucket: f.bucket, path: f.path });
            removeFailure(meta, (x) => x.kind === "storage" && x.bucket === f.bucket && x.path === f.path);
            continue;
          }
          if (!hasUploadWindow(tickStart)) { cursor--; break; }
          const { data: blob, error: dlErr } = await admin.storage.from(f.bucket).download(f.path);
          if (dlErr || !blob) throw new Error(dlErr?.message || "下载失败");
          const buf = new Uint8Array(await blob.arrayBuffer());
          const result = await cosPutObject({
            cfg, key: cosKey, body: buf,
            contentType: blob.type || "application/octet-stream",
            ...cosPutBudget(tickStart, buf.byteLength, (f.size ?? buf.byteLength) > LARGE_FILE_THRESHOLD),
          });
          uploaded++; bytes += result.size; filesCount++; totalBytes += result.size;
          (meta.manifest ??= []).push({ kind: "storage", key: cosKey, size: result.size, etag: result.etag, bucket: f.bucket, path: f.path });
          removeFailure(meta, (x) => x.kind === "storage" && x.bucket === f.bucket && x.path === f.path);
        } catch (e) {
          failed++;
          recordFailure(meta, { kind: "storage", bucket: f.bucket, path: f.path, size: f.size, error: e instanceof Error ? e.message : String(e) });
        }
      }
      bumpPass(meta, "storage_pass2", { uploaded, failed, bytes, elapsed_ms: Date.now() - passStart, total: queue.length });
      meta.retry_cursor = cursor;
      meta.step = `补传失败文件 ${cursor}/${queue.length}`;
      if (cursor >= queue.length) { meta.phase = "finalize"; meta.step = "生成清单和对账"; }
    }

    // ============= DATABASE PHASE =============
    const dbPassStart = Date.now();
    let dbUploaded = 0, dbFailed = 0, dbBytes = 0;
    while (meta.phase === "database" && Date.now() - tickStart < TICK_BUDGET_MS) {
      const start = meta.table_index ?? 0;
      if (start >= TABLES.length) { meta.phase = "storage_list"; meta.step = "正在扫描图片和视频"; break; }
      const table = TABLES[start];
      const offset = meta.table_offset ?? 0;
      const part = Math.floor(offset / PAGE_SIZE).toString().padStart(6, "0");
      const key = `db-backups/daily/${day}/tables/${table}/part-${part}.json.gz`;
      try {
        const dumped = await dumpTable(admin, table, offset);
        if (dumped.rows > 0 || offset === 0) {
          if (!hasUploadWindow(tickStart)) break;
          const uploaded = await cosPutObject({
            cfg, key, body: dumped.bytes, contentType: "application/gzip",
            ...cosPutBudget(tickStart, dumped.bytes.byteLength, false),
          });
          meta.database_files = (meta.database_files ?? 0) + 1;
          filesCount++; totalBytes += uploaded.size;
          dbUploaded++; dbBytes += uploaded.size;
          (meta.manifest ??= []).push({ kind: "table", key, size: uploaded.size, etag: uploaded.etag, table });
        }
        meta.database_rows = (meta.database_rows ?? 0) + dumped.rows;
        if (dumped.hasMore) meta.table_offset = offset + PAGE_SIZE;
        else { meta.table_index = start + 1; meta.table_offset = 0; }
        meta.step = `正在备份系统记录 ${meta.table_index}/${TABLES.length}`;
      } catch (e) {
        dbFailed++;
        recordFailure(meta, { kind: "table", table, offset, error: e instanceof Error ? e.message : String(e) });
        meta.table_index = start + 1; meta.table_offset = 0;
      }
    }
    if (dbUploaded + dbFailed > 0) bumpPass(meta, "database", { uploaded: dbUploaded, failed: dbFailed, bytes: dbBytes, elapsed_ms: Date.now() - dbPassStart, total: TABLES.length });

    // ============= STORAGE LIST PHASE =============
    if (meta.phase === "storage_list" && Date.now() - tickStart < TICK_BUDGET_MS) {
      const bucketIdx = meta.storage_bucket_index ?? 0;
      if (bucketIdx >= BUCKETS.length) { meta.phase = "storage"; }
      else {
        try {
          const bucket = BUCKETS[bucketIdx];
          const files = await listBucketRecursive(admin, bucket);
          const manifestKey = `db-backups/daily/${day}/_manifest/${String(bucketIdx).padStart(2, "0")}-${bucket}.json.gz`;
          const raw = new TextEncoder().encode(JSON.stringify(files));
          const gz = await gzip(raw);
          await cosPutObject({
            cfg, key: manifestKey, body: gz, contentType: "application/gzip",
            ...cosPutBudget(tickStart, gz.byteLength, false),
          });
          meta.storage_total = (meta.storage_total ?? 0) + files.length;
          meta.storage_bucket_index = bucketIdx + 1;
          meta.step = `正在扫描图片和视频 (${meta.storage_bucket_index}/${BUCKETS.length})`;
          if (meta.storage_bucket_index >= BUCKETS.length) { meta.phase = "storage"; meta.storage_cursor = 0; meta.step = "正在上传图片和视频"; }
        } catch (e) {
          recordFailure(meta, { kind: "storage", bucket: BUCKETS[bucketIdx], path: "_scan", error: e instanceof Error ? e.message : String(e) });
          meta.storage_bucket_index = bucketIdx + 1;
          if (meta.storage_bucket_index >= BUCKETS.length) { meta.phase = "storage"; meta.storage_cursor = 0; }
        }
      }
    }

    // ============= STORAGE UPLOAD PHASE =============
    if (meta.phase === "storage" && !meta.retry_queue && Date.now() - tickStart < TICK_BUDGET_MS) {
      const manifests = await loadBucketManifests(cfg, day);
      let cursor = meta.storage_cursor ?? 0;
      let uploaded = meta.storage_uploaded ?? 0;
      let skipped = meta.storage_skipped ?? 0;
      let deferred = meta.storage_deferred ?? 0;
      const pass = meta.storage_pass ?? 1;
      const passStart = Date.now();
      let passUploaded = 0, passFailed = 0, passSkipped = 0, passBytes = 0;
      const passKey: PassKey = pass === 1 ? "storage_pass1" : "storage_pass2";
      // Set totals for this pass
      const passTotal = manifests.filter((f) => f.size <= MAX_FILE_BYTES && (pass === 1 ? f.size <= LARGE_FILE_THRESHOLD : f.size > LARGE_FILE_THRESHOLD)).length;
      bumpPass(meta, passKey, { total: passTotal });

      while (cursor < manifests.length && hasUploadWindow(tickStart)) {
        const file = manifests[cursor++];
        if (!file || file.size > MAX_FILE_BYTES) { skipped++; passSkipped++; continue; }
        if (pass === 1 && file.size > LARGE_FILE_THRESHOLD) { deferred++; continue; }
        if (pass === 2 && file.size <= LARGE_FILE_THRESHOLD) { continue; }
        const cosKey = `storage-mirror/${file.bucket}/${file.path}`;
        try {
          const idx = await getMirrorIndex(file.bucket);
          const existing = idx.get(cosKey);
          if (existing && existing.size === file.size) {
            skipped++; passSkipped++;
            // Record in manifest so reconcile sees it; no network round-trip needed.
            (meta.manifest ??= []).push({ kind: "storage", key: cosKey, size: existing.size, etag: existing.etag, bucket: file.bucket, path: file.path });
            continue;
          }
          if (!hasUploadWindow(tickStart)) { cursor--; break; }
          const { data: blob, error: dlErr } = await admin.storage.from(file.bucket).download(file.path);
          if (dlErr || !blob) throw new Error(dlErr?.message || "下载文件失败");
          const buf = new Uint8Array(await blob.arrayBuffer());
          const result = await cosPutObject({
            cfg, key: cosKey, body: buf,
            contentType: blob.type || file.mime || "application/octet-stream",
            ...cosPutBudget(tickStart, file.size || buf.byteLength, pass === 2),
          });
          uploaded++; passUploaded++; passBytes += result.size;
          filesCount++; totalBytes += result.size;
          (meta.manifest ??= []).push({ kind: "storage", key: cosKey, size: result.size, etag: result.etag, bucket: file.bucket, path: file.path });
          // Populate the cache so a size-only change later this tick still hits.
          idx.set(cosKey, { size: result.size, etag: result.etag });
          removeFailure(meta, (x) => x.kind === "storage" && x.bucket === file.bucket && x.path === file.path);
        } catch (e) {
          passFailed++;
          recordFailure(meta, { kind: "storage", bucket: file.bucket, path: file.path, size: file.size, error: e instanceof Error ? e.message : String(e) });
        }
      }
      bumpPass(meta, passKey, { uploaded: passUploaded, failed: passFailed, skipped: passSkipped, bytes: passBytes, elapsed_ms: Date.now() - passStart });

      meta.storage_cursor = cursor;
      meta.storage_uploaded = uploaded;
      meta.storage_skipped = skipped;
      meta.storage_deferred = deferred;
      const totalToWalk = manifests.length;
      if (cursor >= totalToWalk && totalToWalk > 0) {
        if (pass === 1 && deferred > 0) {
          meta.storage_pass = 2; meta.storage_cursor = 0;
          meta.step = `图片已完成，开始上传大视频（${deferred} 个）`;
        } else {
          meta.phase = "finalize"; meta.step = "生成清单和对账";
        }
      } else {
        const label = pass === 1 ? "图片" : "视频";
        meta.step = `正在上传${label} ${cursor}/${totalToWalk || meta.storage_total}`;
      }
      if (totalToWalk === 0 && (meta.storage_total ?? 0) === 0) { meta.phase = "finalize"; meta.step = "生成清单和对账"; }
    }

    // ============= FINALIZE PHASE =============
    if (meta.phase === "finalize" && Date.now() - tickStart < TICK_BUDGET_MS) {
      await finalizeManifestAndReconcile(admin, cfg, runId, meta, day);
      meta.phase = "done";
      meta.step = meta.reconcile?.ok ? "备份完成" : "备份完成（对账发现缺失）";
    }

    meta.last_tick_at = new Date().toISOString();
    const finished = meta.phase === "done";
    const startedAt = new Date(active.metadata.last_tick_at ? active.metadata.last_tick_at : Date.now()).getTime();
    void startedAt;

    if (finished) {
      const { data: rowNow } = await admin.from("backup_runs").select("started_at").eq("id", runId).single();
      const elapsed = rowNow ? Date.now() - new Date((rowNow as { started_at: string }).started_at).getTime() : 0;
      await sendCompletionNotification(admin, runId, meta, filesCount, elapsed, triggerBy);
    }

    await updateRun(admin, runId, {
      status: finished ? "success" : "running",
      finished_at: finished ? new Date().toISOString() : null,
      files_count: filesCount,
      total_bytes: totalBytes,
      cos_key: `db-backups/daily/${day}/`,
      error_message: (meta.failures?.length ?? 0) > 0
        ? (meta.failures ?? []).slice(0, 3).map((f) => `${f.bucket ?? f.table}${f.path ? "/" + f.path : ""}：${f.error}`).join("\n")
        : null,
      metadata: meta,
    });

    if (!finished) scheduleContinuation(req.url);

    return json({
      ok: true, completed: finished, run_id: runId, step: meta.step,
      files: filesCount, bytes: totalBytes, phase: meta.phase,
      failures: meta.failures?.length ?? 0,
      reconcile: meta.reconcile,
      manifest_key: meta.manifest_key,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (currentRunId) {
      await updateRun(admin, currentRunId, {
        status: "failed", finished_at: new Date().toISOString(),
        error_message: humanize(message), metadata: { step: "备份失败" },
      });
    }
    return json({ ok: false, error: humanize(message) }, 500);
  }
});

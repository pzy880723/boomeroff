// Daily full-database backup -> Tencent COS as gzipped JSONL per table.
// Output layout:
//   db-backups/daily/YYYY-MM-DD/<table>.jsonl.gz
//   db-backups/monthly/YYYY-MM-01/<table>.jsonl.gz  (when day == 01)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  cosPutObject,
  gzip,
  readCosConfigFromEnv,
} from "../_shared/tencentCos.ts";

// Skip Supabase-managed schemas and very large /append-only logs that are unhelpful to dump.
const SKIP_TABLES = new Set<string>([
  "kb_ingest_queue",
]);

const PAGE_SIZE = 1000;

async function listPublicTables(admin: ReturnType<typeof createClient>): Promise<string[]> {
  // Use a known catalog table via PostgREST? Easier: hardcode introspection RPC.
  // Fallback: read from pg_catalog via rpc isn't available; use service-role to call a SQL query.
  // We rely on a simple approach: query information_schema.tables via PostgREST views isn't direct,
  // so call a tiny RPC-less workaround using the REST endpoint /pg_meta? Not available.
  // Practical approach: pass a known list as env override or hardcode from migration knowledge.
  // For robustness we use the Postgres meta endpoint: select from information_schema isn't exposed.
  // -> We call a stored helper if present, else use a curated fallback.

  const { data, error } = await admin
    .from("pg_tables_public_view" as never)
    .select("tablename");
  if (!error && Array.isArray(data) && data.length) {
    return (data as Array<{ tablename: string }>).map((r) => r.tablename);
  }
  // Curated fallback (kept in sync with /supabase-tables in agent context).
  return [
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
}

async function dumpTableAsJsonl(
  admin: ReturnType<typeof createClient>,
  table: string,
): Promise<{ bytes: Uint8Array; rowCount: number }> {
  const chunks: string[] = [];
  let from = 0;
  let total = 0;
  while (true) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`读取 ${table} 失败: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) chunks.push(JSON.stringify(row));
    total += data.length;
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  const text = chunks.length ? chunks.join("\n") + "\n" : "";
  return { bytes: new TextEncoder().encode(text), rowCount: total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: { trigger_source?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const trigger = body.trigger_source === "cron" ? "cron" : "manual";

  // Open backup_runs row
  const { data: runRow, error: insErr } = await admin
    .from("backup_runs")
    .insert({ kind: "database", status: "running", trigger_source: trigger })
    .select()
    .single();
  if (insErr || !runRow) {
    return new Response(JSON.stringify({ error: "无法创建备份记录: " + (insErr?.message ?? "") }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId = (runRow as { id: string }).id;

  try {
    const cfg = readCosConfigFromEnv();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC OK; daily granularity)
    const isFirstOfMonth = today.endsWith("-01");
    const prefix = isFirstOfMonth ? `db-backups/monthly/${today}` : `db-backups/daily/${today}`;

    const tables = (await listPublicTables(admin)).filter((t) => !SKIP_TABLES.has(t));
    let totalBytes = 0;
    let filesCount = 0;
    const perTable: Record<string, { rows: number; bytes: number }> = {};

    for (const table of tables) {
      try {
        const { bytes, rowCount } = await dumpTableAsJsonl(admin, table);
        if (rowCount === 0) {
          perTable[table] = { rows: 0, bytes: 0 };
          continue;
        }
        const gz = await gzip(bytes);
        const key = `${prefix}/${table}.jsonl.gz`;
        const { size } = await cosPutObject({
          cfg, key, body: gz, contentType: "application/gzip",
        });
        totalBytes += size;
        filesCount += 1;
        perTable[table] = { rows: rowCount, bytes: size };
      } catch (e) {
        perTable[table] = { rows: -1, bytes: 0, ...(e instanceof Error ? { error: e.message } : {}) } as never;
      }
    }

    await admin.from("backup_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      cos_key: prefix,
      files_count: filesCount,
      total_bytes: totalBytes,
      metadata: { per_table: perTable },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true, run_id: runId, prefix, files: filesCount, bytes: totalBytes,
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

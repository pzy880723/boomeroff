// Executes the actual latest app_bootstrap_v1 SQL, never a rewritten JS model.
// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';

let db: PGlite;
const uid = '00000000-0000-4000-8000-000000000001';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uid}'::uuid $$;
    CREATE TABLE scope_fixture (value jsonb);
    INSERT INTO scope_fixture VALUES ('{}');
    CREATE FUNCTION current_user_erp_scope() RETURNS jsonb LANGUAGE sql AS $$ SELECT value FROM scope_fixture $$;
    CREATE FUNCTION current_shop_context_v1() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('scope', value->>'scope') FROM scope_fixture $$;
    CREATE FUNCTION erp_action_permissions() RETURNS text[] LANGUAGE sql AS $$ SELECT ARRAY['role.manage']::text[] $$;
    CREATE TABLE user_roles (user_id uuid, role text, role_code text, suspended boolean, created_at timestamptz);
    INSERT INTO user_roles VALUES ('${uid}', 'admin', 'super_admin', false, now());
    CREATE TABLE app_role_permissions (role_code text, permission_key text);
    INSERT INTO app_role_permissions VALUES ('super_admin', 'legacy.manage');
    CREATE TABLE profiles (user_id uuid, display_name text, avatar_url text, phone text);
    CREATE TABLE staff_profiles (user_id uuid, real_name text, shop_id uuid);
    CREATE TABLE shift_schedules (user_id uuid, work_date date, shift_code text, shop_id uuid);
    CREATE TABLE shop_shifts (code text, name text, start_time time, end_time time, color text, sort_order int, active boolean, shop_id uuid);
    CREATE TABLE user_check_ins (user_id uuid, check_in_date date);
    CREATE TABLE activities (id uuid, name text, cover_url text, ends_at timestamptz, voucher_id uuid, status text, created_by uuid, starts_at timestamptz, created_at timestamptz);
    CREATE TABLE operation_okrs (id uuid, title text, objective text, key_results jsonb, tags text[], created_at timestamptz, shop_id uuid, period_start date, period_end date, scope text);
    CREATE TABLE daily_encouragement (date date, text text);
  `);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  let definition = '';
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(new URL(file, dir), 'utf8');
    const match = sql.match(/CREATE OR REPLACE FUNCTION public\.app_bootstrap_v1\(\)[\s\S]*?\n\$\$;/i);
    if (match) definition = match[0];
  }
  expect(definition).not.toBe('');
  await db.exec(definition);
}, 30_000);
afterAll(async () => { await db?.close(); });

async function bootstrap(scope: string, governed: boolean, roles = ['super_admin'], reason = '') {
  await db.query('UPDATE scope_fixture SET value = $1', [{ scope, erp_governed: governed, erp_linked: governed, role_codes: roles, reason }]);
  const result = await db.query<{ value: { user_role: { role: string; role_code: string | null; role_codes: string[]; source: string }; permissions: string[]; shop_context: { scope: string } } }>('SELECT app_bootstrap_v1() AS value');
  return result.rows[0].value;
}

for (const reason of ['scope_stale', 'invalid_shop_mapping', 'mapping_revoked']) {
  it(`strips stale ERP admin roles and permissions for ${reason}`, async () => {
    const value = await bootstrap('unconfigured', true, ['super_admin'], reason);
    expect(value.user_role.role).not.toBe('admin');
    expect(value.user_role.role_codes).toEqual([]);
    expect(value.user_role.role_code).toBeNull();
    expect(value.permissions).toEqual([]);
    expect(value.user_role.source).toBe('erp');
  });
}
it('preserves never-governed legacy roles and permissions unchanged', async () => {
  const value = await bootstrap('unconfigured', false);
  expect(value.user_role.role).toBe('admin');
  expect(value.user_role.role_code).toBe('super_admin');
  expect(value.permissions).toEqual(['legacy.manage']);
  expect(value.user_role.source).toBe('legacy');
});
it('selects already-authorized super_admin consistently in HQ multi-role input without expanding scope', async () => {
  const value = await bootstrap('hq', true, ['store_staff', 'super_admin']);
  expect(value.user_role.role_code).toBe('super_admin');
  expect(value.user_role.role_codes).toEqual(['store_staff', 'super_admin']);
  expect(value.permissions).toEqual(['role.manage']);
  expect(value.shop_context.scope).toBe('hq');
});
it('does not manufacture super_admin from HQ scope alone', async () => {
  const value = await bootstrap('hq', true, ['region_manager']);
  expect(value.user_role.role).toBe('anchor');
  expect(value.user_role.role_code).toBe('region_manager');
  expect(value.shop_context.scope).toBe('hq');
});

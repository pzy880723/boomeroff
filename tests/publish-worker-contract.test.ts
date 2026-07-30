import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('批量发布兼容旧 SAU 接口要求的 JSON 数组', () => {
  const source = read('../supabase/functions/_shared/sau.ts');
  assert.ok(source.includes('body: JSON.stringify([payload])'));
});

test('账号适配层只把 Worker 确认有效的账号返回给发布中心', () => {
  const source = read('../supabase/functions/_shared/sau.ts');
  assert.match(source, /\.filter\(\(account\)\s*=>\s*account\.status\s*===\s*1\)/);
});

test('账号绑定和回调统一写 valid，自动化兼容历史 active 状态', () => {
  const login = read('../supabase/functions/dispatch-account-login/index.ts');
  const callback = read('../supabase/functions/worker-callback/index.ts');
  const automation = read('../supabase/functions/automation-tick/index.ts');
  const migration = read('../supabase/migrations/20260730030000_normalize_social_account_cookie_status.sql');

  assert.match(login, /cookie_status:\s*acct\.status\s*===\s*0\s*\?\s*["']expired["']\s*:\s*["']valid["']/);
  assert.doesNotMatch(callback, /cookie_status:\s*["']active["']/);
  assert.match(callback, /cookie_status:\s*["']valid["']/);
  assert.match(automation, /const HEALTHY_COOKIE_STATUS = \[["']active["'],\s*["']valid["']\]/);
  assert.match(automation, /\.in\(["']cookie_status["'],\s*HEALTHY_COOKIE_STATUS\)/);
  assert.match(migration, /update public\.social_accounts[\s\S]*set cookie_status = 'valid'[\s\S]*where cookie_status = 'active'/i);
  assert.match(migration, /'valid'/);
});

test('账号绑定只描述保存账号关联，不再误称同步素材', () => {
  const edge = read('../supabase/functions/dispatch-account-login/index.ts');
  const dialog = read('../src/pages/marketing/dispatch/AddAccountDialog.tsx');

  assert.doesNotMatch(edge, /写入素材系统/);
  assert.match(edge, /保存账号关联失败/);
  assert.doesNotMatch(dialog, /正在同步账号|正在写入账号/);
  assert.match(dialog, /正在保存账号关联/);
});

test('账号资料契约保存主页名称、介绍、小红书号和内部备注', () => {
  const migrationUrl = new URL('../supabase/migrations/20260730054041_add_social_account_profile.sql', import.meta.url);
  const profileFnUrl = new URL('../supabase/functions/dispatch-account-profile/index.ts', import.meta.url);
  assert.equal(existsSync(migrationUrl), true, '缺少账号资料 migration');
  assert.equal(existsSync(profileFnUrl), true, '缺少账号资料刷新/备注 Edge Function');

  const migration = readFileSync(migrationUrl, 'utf8');
  const login = read('../supabase/functions/dispatch-account-login/index.ts');
  const profileFn = readFileSync(profileFnUrl, 'utf8');

  for (const column of ['profile_bio', 'platform_account_id', 'account_remark', 'profile_synced_at']) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(login, /profile_bio:\s*acct\.bio/);
  assert.match(login, /platform_account_id:\s*acct\.platform_account_id/);
  assert.match(profileFn, /action\s*===\s*["']remark["']/);
  assert.match(profileFn, /action\s*===\s*["']refresh["']/);
  assert.match(profileFn, /sauGetAccountProfile/);
  assert.match(profileFn, /\.eq\(["']id["'],\s*account_id\)/);
});

test('账号卡片显示真实主页资料并支持备注和刷新', () => {
  const accounts = read('../src/pages/marketing/dispatch/Accounts.tsx');
  const dispatchTypes = read('../src/lib/dispatch.ts');
  assert.match(dispatchTypes, /profile_bio\??:\s*string\s*\|\s*null/);
  assert.match(dispatchTypes, /platform_account_id\??:\s*string\s*\|\s*null/);
  assert.match(dispatchTypes, /account_remark\??:\s*string\s*\|\s*null/);
  assert.match(accounts, /编辑备注/);
  assert.match(accounts, /刷新主页资料/);
  assert.match(accounts, /profile_bio/);
  assert.match(accounts, /platform_account_id/);
  assert.match(accounts, /account_remark/);
  assert.match(accounts, /\/api\/marketing\/account-profile/);
  assert.match(accounts, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(accounts, /\.from\('social_accounts' as any\)/);
  assert.match(accounts, /workerResult\.error/);
  assert.match(accounts, /online:\s*workerAccount\?\.online/);
  assert.match(accounts, /const workerPromise = invokeFn/);
  assert.match(accounts, /setAccounts\(dbAccounts\)/);
});

test('新建发布只写入 Worker 队列，不在 Edge Function 内等待浏览器发布', () => {
  const source = read('../supabase/functions/dispatch-job-create/index.ts');
  assert.doesNotMatch(source, /sauUpload|sauPostVideoBatch|sauPostImageBatch/);
  assert.match(source, /status:\s*isDelayed\s*\?\s*["']scheduled["']\s*:\s*["']queued["']/);
  assert.match(source, /status:\s*isDelayed\s*\?\s*["']scheduled["']\s*:\s*["']pending["']/);
});

test('新建发布会拦截失效账号、不支持的视频和定时任务', () => {
  const source = read('../supabase/functions/dispatch-job-create/index.ts');
  assert.match(source, /cookie_status/);
  assert.match(source, /supports_video/);
  assert.match(source, /supports_schedule/);
});

test('重试只把 target 放回 pending 队列', () => {
  const source = read('../supabase/functions/dispatch-job-retry/index.ts');
  assert.doesNotMatch(source, /sauPostVideoBatch/);
  assert.match(source, /status:\s*["']pending["']/);
});

test('导演完成接口返回素材 ID，完成页可直接进入发布工作台', () => {
  const complete = read('../supabase/functions/director-complete-job/index.ts');
  const api = read('../src/api/videoGeneration.ts');
  const progress = read('../src/components/marketing/director/DirectorProgress.tsx');
  assert.match(complete, /asset_id/);
  assert.match(api, /Promise<string>/);
  assert.match(progress, /dispatch\/workbench\?asset_id=/);
});

test('大众点评 migration 同步放开账号平台和 Worker 队列状态', () => {
  const migration = read('../supabase/migrations/20260716000100_add_dianping_publish_platform.sql');
  assert.match(migration, /social_accounts_platform_check/);
  assert.match(migration, /'dianping'/);
  assert.match(migration, /'pending'/);
  assert.match(migration, /'claimed'/);
  assert.match(migration, /claim_expires_at/);
});

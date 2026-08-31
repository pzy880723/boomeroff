import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('营销中心只展示一个 BOOMER 视频创作入口', () => {
  const page = read('../src/pages/MyMarketing.tsx');

  assert.ok(page.includes('一句话改脚本 · 一键生成视频'));
  assert.ok(page.includes('BOOMER 帮你拍一条'));
  assert.doesNotMatch(page, /title="AI 图片"/);
  assert.doesNotMatch(page, /title="AI 文案"/);
  assert.doesNotMatch(page, />AI 视频</);
  assert.doesNotMatch(page, /to="\/me\/marketing\/video"/);
});

test('统一弹窗同时支持自然语言改稿、直接编辑和更换参考图', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');

  assert.ok(dialog.includes('SurpriseScriptChat'), '缺少自然语言改稿组件');
  assert.ok(dialog.includes('LibraryImagePickerDialog'), '缺少参考图选择器');
  assert.ok(dialog.includes('chatSurpriseScriptJob'), '缺少对话需求记录调用');
  assert.ok(dialog.includes('applySurpriseScriptConversation'), '缺少一次性应用改稿调用');
  assert.ok(dialog.includes('updateSurpriseScriptAssets'), '缺少参考图更新调用');
  assert.ok(dialog.includes('编辑脚本'));
  assert.ok(dialog.includes('renderSurpriseVideo'));
  assert.ok(dialog.includes('固定 9:16 · 时长 15s · 一段直出 · 1080p'));
});

test('脚本任务服务持久化自然语言对话和参考图', () => {
  const api = read('../src/api/surpriseScriptJob.ts');
  const endpoint = read('../supabase/functions/surprise-script-job/index.ts');
  const revision = read('../supabase/functions/_shared/surprise-script-revision.ts');

  assert.ok(api.includes('reviseSurpriseScriptJob'));
  assert.ok(api.includes('updateSurpriseScriptAssets'));
  assert.ok(api.includes('saveSurpriseScriptDraft'));
  assert.ok(api.includes('script_job_id'));
  assert.ok(endpoint.includes('action === "revise"'));
  assert.ok(endpoint.includes('action === "update_assets"'));
  assert.ok(endpoint.includes('surprise_conversation'));
  assert.ok(endpoint.includes('script_versions'));
  assert.ok(endpoint.includes('manual_script_draft'));
  assert.ok(endpoint.includes('render_job_id'));
  assert.match(revision, /role:\s*'storefront'/);
});

test('生成按钮等待改稿和换图结束，提交使用服务端最终参考图', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');
  const picker = read('../src/components/marketing/LibraryImagePickerDialog.tsx');
  assert.match(dialog, /disabled=\{submitting \|\| revising \|\| chatting \|\| updatingAssets \|\| pendingChanges\.length > 0\}/);
  assert.match(dialog, /script_job_id:\s*scriptJobId/);
  assert.doesNotMatch(dialog, /markSurpriseScriptRendered/);
  assert.match(picker, /await supabase\.from\('marketing_assets'[\s\S]*?\.insert\([\s\S]*?\)\.select\('id'\)\.single\(\)/);
  assert.match(picker, /if \(insertError\) throw new Error/);
});

test('最终 Seedance 提交只读取服务端已保存脚本并预绑定渲染任务', () => {
  const endpoint = read('../supabase/functions/surprise-marketing-video/index.ts');
  const render = read('../supabase/functions/render-marketing-video/index.ts');

  assert.match(endpoint, /script_job_id/);
  assert.match(endpoint, /from\(['"]video_generation_jobs['"]\)/);
  assert.match(endpoint, /validateSurpriseScript/);
  assert.match(endpoint, /requested_job_id/);
  assert.match(endpoint, /video_submitting/);
  assert.match(endpoint, /render_payload/);
  assert.match(endpoint, /rollbackSubmission/);
  assert.match(render, /requested_job_id/);
  assert.match(render, /sourceJob\.meta\?\.render_payload/);
  assert.match(render, /script\s*=\s*trustedPayload\.script/);
});

test('脚本自动保存严格串行，旧请求不会覆盖新改稿或参考图', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');
  assert.match(dialog, /scriptSaveQueueRef\.current\s*=\s*scriptSaveQueueRef\.current/);
  assert.match(dialog, /await scriptSaveQueueRef\.current/);
  assert.doesNotMatch(dialog, /scriptSavePromiseRef/);
});

test('同一用户同一门店只允许一个未消费的 BOOMER 脚本任务', () => {
  const migration = read('../supabase/migrations/20260830090000_unique_active_surprise_script_job.sql');
  const endpoint = read('../supabase/functions/surprise-script-job/index.ts');

  assert.match(migration, /create unique index/i);
  assert.match(migration, /video_generation_jobs/i);
  assert.match(migration, /meta->>'flow'\s*=\s*'surprise'/i);
  assert.match(endpoint, /23505/);
});

test('旧导演路由保留兼容但不再出现在营销首页', () => {
  const app = read('../src/App.tsx');
  const page = read('../src/pages/MyMarketing.tsx');

  assert.match(app, /path="\/me\/marketing\/video"/);
  assert.doesNotMatch(page, /to="\/me\/marketing\/video"/);
});

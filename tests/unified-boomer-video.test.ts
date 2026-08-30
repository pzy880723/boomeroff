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
  assert.ok(dialog.includes('reviseSurpriseScriptJob'), '缺少持久改稿调用');
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
  assert.ok(endpoint.includes('action === "revise"'));
  assert.ok(endpoint.includes('action === "update_assets"'));
  assert.ok(endpoint.includes('surprise_conversation'));
  assert.ok(endpoint.includes('script_versions'));
  assert.match(revision, /role:\s*'storefront'/);
});

test('旧导演路由保留兼容但不再出现在营销首页', () => {
  const app = read('../src/App.tsx');
  const page = read('../src/pages/MyMarketing.tsx');

  assert.match(app, /path="\/me\/marketing\/video"/);
  assert.doesNotMatch(page, /to="\/me\/marketing\/video"/);
});

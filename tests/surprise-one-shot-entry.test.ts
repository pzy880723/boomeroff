import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('BOOMER 帮我拍确认脚本后走 15 秒一次成片，不进入导演台', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');

  assert.doesNotMatch(dialog, /DirectorProgress/);
  assert.doesNotMatch(dialog, /createVideoJob/);
  assert.match(dialog, /renderSurpriseVideo/);
  assert.match(dialog, /kind:\s*['"]legacy['"]/);
});

test('一次成片提交前保存最终脚本，成功后清除草稿', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');

  assert.match(
    dialog,
    /saveSurpriseScriptJob\(scriptJobId,\s*pick\.script\)[\s\S]*renderSurpriseVideo[\s\S]*discardSurpriseScriptJob/,
  );
});

test('旧导演任务只做迁移清理，不再恢复导演台', () => {
  const dialog = read('../src/components/marketing/SurpriseVideoDialog.tsx');

  assert.match(dialog, /cachedJob\?\.kind\s*===\s*['"]director['"]/);
  assert.match(dialog, /dismissSurpriseVideoJob\(cachedJob\.jobId\)/);
  assert.doesNotMatch(dialog, /activeJob\.kind\s*===\s*['"]director['"]/);
});

test('惊喜一下后端固定把确认脚本提交为 one_shot', () => {
  const endpoint = read('../supabase/functions/surprise-marketing-video/index.ts');

  assert.match(endpoint, /render_strategy:\s*['"]one_shot['"]/);
  assert.match(endpoint, /body\.script\s*&&\s*body\.picked_assets/);
});

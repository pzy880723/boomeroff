import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/api/surpriseScriptJob.ts', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/components/marketing/SurpriseVideoDialog.tsx', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/components/marketing/SurpriseCategoryPicker.tsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/components/marketing/SurpriseScriptChat.tsx', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/surprise-script-job/index.ts', import.meta.url), 'utf8');

test('脚本任务 API 支持只恢复、带品类启动和批量对话动作', () => {
  assert.match(api, /getCurrentSurpriseScriptJob/);
  assert.match(api, /content_scope/);
  assert.match(api, /replace_current/);
  assert.match(api, /chatSurpriseScriptJob/);
  assert.match(api, /applySurpriseScriptConversation/);
  assert.match(api, /clearSurpriseScriptConversation/);
});

test('脚本任务服务端把品类传给生成器并区分聊天与应用', () => {
  assert.match(edge, /action === ['"]current['"]/);
  assert.match(edge, /content_scope/);
  assert.match(edge, /replaceCurrent/);
  assert.match(edge, /action === ['"]chat['"]/);
  assert.match(edge, /action === ['"]apply_conversation['"]/);
  assert.match(edge, /action === ['"]clear_conversation['"]/);
  assert.match(edge, /surprise_pending_changes/);
});

test('前端先选品类，对话默认收起并由用户一次性应用', () => {
  assert.match(dialog, /SurpriseCategoryPicker/);
  assert.match(dialog, /chatOpen/);
  assert.match(chat, /按以上要求修改脚本/);
  assert.match(chat, /取消本次沟通/);
  assert.doesNotMatch(chat, /改完自动保存/);
});

test('品类选择页可关闭，并把用户当前选择直接交给脚本任务', () => {
  assert.match(picker, /onClose/);
  assert.match(picker, /关闭/);
  assert.match(picker, /onStart: \(value: SurpriseContentScopeKey\) => void/);
  assert.match(picker, /onStart\(selected\.key\)/);
  assert.match(dialog, /onClose=\{\(\) => onOpenChange\(false\)\}/);
  assert.match(dialog, /onStart=\{\(contentScope\) => void doPick\(excluded, contentScope, true\)\}/);
  assert.doesNotMatch(dialog, /更换商品类别会放弃当前脚本/);
});

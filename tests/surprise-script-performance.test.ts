import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildFastSurpriseFallback, completeShortGeneratedScript } from '../supabase/functions/_shared/surprise-script-performance.ts';
import { validateSurpriseScript } from '../supabase/functions/_shared/surprise-script-policy.ts';

test('快速兜底稿仍满足高密度五镜、字幕对齐和连续口播规则', () => {
  const script = buildFastSurpriseFallback({
    shopName: '上海中信泰富店',
    imageDescriptions: [
      { index: 0, summary: '商场地下一层开放式门头与 BOOMER OFF 招牌' },
      { index: 1, summary: '店内整排复古杂货货架' },
      { index: 2, summary: '玩具瓷器与老唱片细节' },
    ],
  });

  const validation = validateSurpriseScript(script, {
    factContext: '上海中信泰富店 中古杂货 玩具 瓷器 老唱片',
  });
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.dialogueLength >= 90 && validation.dialogueLength <= 100);
  assert.equal(script.publish_copy?.title.includes('中信泰富'), true);
});

test('保留 DeepSeek 短稿内容并确定性补齐，不直接替换为固定兜底稿', () => {
  const dialogues = ['这家店值得来逛', '进门就有满架惊喜', '拿起小物细节丰富', '慢慢挑选很有意思', '现在就来店里看看'];
  const script = completeShortGeneratedScript({
    continuous_dialogue: dialogues.join('，'),
    hook: { scene: '真实门头', action: '边走边对镜头说', dialogue: dialogues[0], subtitle: dialogues[0], image_index: 0 },
    scenes: dialogues.slice(1, 4).map((dialogue, index) => ({
      scene: `店内实景${index + 1}`,
      action: '边拿起商品边对镜头继续说',
      dialogue,
      subtitle: dialogue,
      image_index: index + 1,
    })),
    outro: { scene: '店内全景', action: '边招手边对镜头继续说', dialogue: dialogues[4], subtitle: dialogues[4], image_index: 4 },
  });
  const validation = validateSurpriseScript(script);
  assert.deepEqual(validation.errors, []);
  assert.match(String(script.hook.dialogue), /^这家店值得来逛/);
  assert.match(String(script.outro.dialogue), /^现在就来店里看看/);
  assert.equal(script.outro.subtitle, script.outro.dialogue);
});

test('惊喜一下使用官方 DeepSeek 模型并允许一次定向修复', () => {
  const source = readFileSync(
    new URL('../supabase/functions/generate-marketing-video-script/index.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /deepseek-chat/);
  assert.doesNotMatch(source, /deepseek-v4-flash/);
  assert.match(source, /buildFastSurpriseFallback/);
});

test('惊喜一下预览不等待 AI 生成人设，并给真实脚本生成合理时间', () => {
  const source = readFileSync(
    new URL('../supabase/functions/surprise-marketing-video/index.ts', import.meta.url),
    'utf8',
  );
  const performanceSource = readFileSync(
    new URL('../supabase/functions/_shared/surprise-script-performance.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /generateFastPersona\(/);
  assert.doesNotMatch(source, /await generatePersona\(/);

  const timeout = performanceSource.match(/SURPRISE_MODEL_TIMEOUT_MS\s*=\s*([\d_]+)/);
  assert.ok(timeout, '应声明惊喜脚本模型超时');
  assert.ok(Number(timeout[1].replaceAll('_', '')) >= 10_000, '模型等待不能短到固定触发兜底');
});

test('惊喜一下不再通过第三层 Edge Function 生成脚本', () => {
  const source = readFileSync(
    new URL('../supabase/functions/surprise-marketing-video/index.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /generateFastSurpriseScript\(/);
  assert.doesNotMatch(source, /functions\/v1\/generate-marketing-video-script/);
});

test('前端一秒轮询一次脚本结果', () => {
  const source = readFileSync(
    new URL('../src/components/marketing/SurpriseVideoDialog.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /window\.setInterval\(tick, 1000\)/);
});

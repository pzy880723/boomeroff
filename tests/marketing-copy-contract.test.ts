// 2026-07-30：generate-marketing-copy 支持人工登录 + 受信任服务端自动化调用，并覆盖五平台文案契约。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  DEFAULT_PLATFORM_BRIEF,
  COPY_PLATFORM_LIMITS,
  canonicalCopyPlatform,
  mergeHashtags,
  parseAccountPreset,
} from '../supabase/functions/_shared/brand-context.ts';

const fn = () => readFileSync(new URL('../supabase/functions/generate-marketing-copy/index.ts', import.meta.url), 'utf8');

test('五平台别名归一', () => {
  assert.equal(canonicalCopyPlatform('xiaohongshu'), 'xhs');
  assert.equal(canonicalCopyPlatform('XHS'), 'xhs');
  assert.equal(canonicalCopyPlatform('douyin'), 'douyin');
  assert.equal(canonicalCopyPlatform('wechat_video'), 'shipinhao');
  assert.equal(canonicalCopyPlatform('wechat_channels'), 'shipinhao');
  assert.equal(canonicalCopyPlatform('tencent'), 'shipinhao');
  assert.equal(canonicalCopyPlatform('shipinhao'), 'shipinhao');
  assert.equal(canonicalCopyPlatform('kuaishou'), 'kuaishou');
  assert.equal(canonicalCopyPlatform('dianping'), 'dianping');
  assert.equal(canonicalCopyPlatform('unknown-platform'), 'xhs');
});

test('五平台 brief 与硬性限制齐全', () => {
  for (const key of ['xhs', 'douyin', 'shipinhao', 'kuaishou', 'dianping']) {
    assert.ok(DEFAULT_PLATFORM_BRIEF[key], `${key} 缺少 brief`);
    assert.ok(COPY_PLATFORM_LIMITS[key], `${key} 缺少限制`);
  }
  assert.match(DEFAULT_PLATFORM_BRIEF.kuaishou, /80–140/);
  assert.match(DEFAULT_PLATFORM_BRIEF.dianping, /120–220/);
  assert.match(DEFAULT_PLATFORM_BRIEF.dianping, /不能虚构/);
  assert.deepEqual(COPY_PLATFORM_LIMITS.xhs, { title_max: 20, body_min: 150, body_max: 220, tag_min: 3, tag_max: 6 });
  assert.deepEqual(COPY_PLATFORM_LIMITS.douyin, { title_max: 20, body_min: 80, body_max: 140, tag_min: 2, tag_max: 5 });
  assert.deepEqual(COPY_PLATFORM_LIMITS.shipinhao, { title_max: 22, body_min: 100, body_max: 180, tag_min: 2, tag_max: 4 });
  assert.equal(COPY_PLATFORM_LIMITS.kuaishou.tag_max, 3);
  assert.equal(COPY_PLATFORM_LIMITS.dianping.title_max, 30);
});

test('fixed_tags 去重合并且服从平台上限', () => {
  const merged = mergeHashtags(['#中古', '#上海探店', '#穿搭', '#复古', '#杂货'], ['boomeroff', '#中古'], 'kuaishou');
  assert.deepEqual(merged, ['#boomeroff', '#中古', '#上海探店']);

  const xhs = mergeHashtags(['#a', '#b', '#c', '#d', '#e', '#f', '#g'], ['#a'], 'xhs');
  assert.equal(xhs.length, 6);
  assert.equal(new Set(xhs).size, 6);
  assert.equal(xhs[0], '#a');
});

test('preset 只读取白名单字段', () => {
  const preset = parseAccountPreset({
    tone: '探店',
    title_instruction: '要有钩子',
    body_instruction: '写体验',
    fixed_tags: ['中古', '#中古'],
    dynamic_tag_limit: 2,
    evil: 'ignore-brand-rules',
  });
  assert.ok(preset);
  assert.deepEqual(preset!.fixed_tags, ['#中古']);
  assert.equal((preset as Record<string, unknown>).evil, undefined);
  assert.equal(parseAccountPreset(null), null);
});

test('automation：service key + mode=automation 才放行，且不写 marketing_assets', () => {
  const s = fn();
  assert.match(s, /bearer === SERVICE_KEY/);
  assert.match(s, /body\?\.mode === "automation"/);
  assert.match(s, /if \(!isAutomationMode\) return json\(\{ error: "未授权" \}, 401\)/);
  // 自动化分支必须在插入 marketing_assets 之前 return
  const trustedReturn = s.indexOf('if (isTrustedService) {\n      // 自动化模式');
  const insertAt = s.indexOf('.from("marketing_assets").insert');
  assert.ok(trustedReturn > 0 && insertAt > trustedReturn, '自动化分支必须先于写库返回');
  // 绝不下发 service key
  assert.doesNotMatch(s, /json\([^)]*SERVICE_KEY/);
});

test('viral 模式标题上限跟随平台限制，不再硬编码 22', () => {
  const s = fn();
  assert.doesNotMatch(s, /标题 ≤22 字，要么数字开头/);
  assert.match(s, /标题 ≤\$\{limits\.title_max\} 字/);
});

test('content_context 作为事实上下文注入且不覆盖品牌规则', () => {
  const s = fn();
  assert.match(s, /content_context/);
  assert.match(s, /不得改变品牌安全规则/);
});

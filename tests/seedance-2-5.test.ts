import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_SEEDANCE_2,
  SEEDANCE_2_5_ID,
  SeedanceModelError,
  normalizeSeedanceDuration,
  resolveSeedanceModel,
  validateSeedanceDuration,
} from '../supabase/functions/_shared/seedance-models.ts';
import { buildArkTaskBody } from '../supabase/functions/_shared/seedance-submit.ts';
import { buildDirectorShotPlan } from '../supabase/functions/_shared/director-utils.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const refs = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/r${i}.jpg`);

test('模型解析:2.5 已注册且 2.0 Pro/Fast/Mini 保留', () => {
  const m = resolveSeedanceModel(SEEDANCE_2_5_ID);
  assert.equal(m.id, 'doubao-seedance-2-5-260628');
  assert.equal(m.max_duration, 30);
  assert.equal(m.min_duration, 4);
  assert.equal(m.max_refs, 50);
  for (const id of ['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-mini-260615']) {
    assert.equal(resolveSeedanceModel(id).max_refs, 9);
    assert.equal(resolveSeedanceModel(id).max_duration, 15);
  }
  assert.equal(resolveSeedanceModel(undefined).id, DEFAULT_SEEDANCE_2);
});

test('未知模型抛 400 错误,不静默回退', () => {
  assert.throws(() => resolveSeedanceModel('doubao-seedance-9-9'), (e: any) => e instanceof SeedanceModelError && e.status === 400 && e.code === 'unknown_seedance_model');
});

test('2.0 时长吸附 5/10/15', () => {
  const m = resolveSeedanceModel(DEFAULT_SEEDANCE_2);
  assert.deepEqual([1, 7, 8, 12, 13, 15].map((d) => normalizeSeedanceDuration(m, d)), [5, 5, 10, 10, 15, 15]);
  assert.throws(() => validateSeedanceDuration(m, 25), SeedanceModelError);
  assert.throws(() => validateSeedanceDuration(m, 16), SeedanceModelError);
});

test('2.5 时长 4–30 合法整数,边界外拒绝', () => {
  const m = resolveSeedanceModel(SEEDANCE_2_5_ID);
  assert.equal(validateSeedanceDuration(m, 4), 4);
  assert.equal(validateSeedanceDuration(m, 25), 25);
  assert.equal(validateSeedanceDuration(m, 30), 30);
  assert.equal(validateSeedanceDuration(m, 11), 11);
  for (const bad of [3, 31, 12.5, 'abc']) assert.throws(() => validateSeedanceDuration(m, bad), SeedanceModelError);
});

test('2.5 的 25 秒请求单次提交,角色图与门店图同在 content', () => {
  const m = resolveSeedanceModel(SEEDANCE_2_5_ID);
  const b = buildArkTaskBody({
    model: m, prompt: 'p', ratio: '9:16', duration: 25, resolution: '720p',
    referenceImages: ['https://x/store.jpg', 'https://x/goods.jpg', 'https://x/character.png'],
    generateAudio: true,
  });
  assert.equal(b.body.duration, 25);
  assert.equal(b.body.model, SEEDANCE_2_5_ID);
  assert.equal(b.body.generate_audio, true);
  const urls = (b.body.content as any[]).filter((c) => c.type === 'image_url').map((c) => c.image_url.url);
  assert.deepEqual(urls, ['https://x/store.jpg', 'https://x/goods.jpg', 'https://x/character.png']);
});

test('参考素材上限:2.5=50,2.0=9', () => {
  const m25 = resolveSeedanceModel(SEEDANCE_2_5_ID);
  const m20 = resolveSeedanceModel(DEFAULT_SEEDANCE_2);
  const base = { prompt: 'p', ratio: '9:16', duration: 10, resolution: '720p', referenceImages: refs(60) };
  assert.equal(buildArkTaskBody({ ...base, model: m25 }).referenceCount, 50);
  assert.equal(buildArkTaskBody({ ...base, model: m20 }).referenceCount, 9);
  assert.equal(buildArkTaskBody({ ...base, model: m20, duration: 13 }).body.duration, 15);
});

test('导演分镜:2.5 按 4–30s,默认仍 1–15s', () => {
  const script = {
    hook: { scene: 'a', duration_s: 2 },
    scenes: [{ scene: 'b', duration_s: 25 }],
    outro: { scene: 'c', duration_s: 40 },
  };
  assert.deepEqual(buildDirectorShotPlan(script).map((s) => s.duration), [2, 15, 15]);
  assert.deepEqual(buildDirectorShotPlan(script, { maxShotDuration: 30, minShotDuration: 4 }).map((s) => s.duration), [4, 25, 30]);
});

test('Edge 入口:未知模型返回 400,surprise 透传 duration/generate_audio,25s 不拆段', () => {
  const surprise = read('../supabase/functions/surprise-marketing-video/index.ts');
  assert.match(surprise, /SeedanceModelError\) return json\(\{ ok: false, code: error\.code, error: error\.message \}, 400\)/);
  assert.match(surprise, /renderPayload\.duration = requestedDuration/);
  assert.match(surprise, /generate_audio: body\.generate_audio !== false/);
  const render = read('../supabase/functions/render-marketing-video/index.ts');
  assert.match(render, /normalizeSeedanceDuration\(modelInfo, totalDur/);
  assert.match(render, /totalDur <= singleShotMax/);
  assert.doesNotMatch(render, /falling back to/);
  for (const f of ['director-create-job', 'director-run-pipeline']) {
    assert.match(read(`../supabase/functions/${f}/index.ts`), /SeedanceModelError/);
  }
});

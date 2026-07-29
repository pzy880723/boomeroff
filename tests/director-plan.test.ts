import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDirectorShotPlan } from '../supabase/functions/_shared/director-utils.ts';

const script15 = {
  hook: { scene: '门店门头', action: '博主走进门店', dialogue: '姐妹快来', subtitle: '周末探店', image_index: 0, duration_s: 3 },
  scenes: [
    { scene: '货架', action: '展示夹克', dialogue: '这件质感绝了', subtitle: '复古夹克', image_index: 1, duration_s: 3 },
    { scene: '穿衣镜', action: '试穿转身', dialogue: '上身真的显瘦', subtitle: '显瘦好搭', image_index: 2, duration_s: 3 },
    { scene: '配饰区', action: '讲解配饰', dialogue: '配饰也很好挑', subtitle: '细节加分', image_index: 3, duration_s: 3 },
  ],
  outro: { scene: '门店全景', action: '挥手邀约', dialogue: '周末快来逛', subtitle: '到店打卡', image_index: 4, duration_s: 3 },
  total_duration_s: 15,
};

test('15 秒五镜脚本按脚本保留五镜与时长', () => {
  const shots = buildDirectorShotPlan(script15);
  assert.equal(shots.length, 5);
  assert.deepEqual(shots.map(s => s.duration), [3, 3, 3, 3, 3]);
  assert.deepEqual(shots.flatMap(s => s.imageIndices), [0, 1, 2, 3, 4]);
  assert.deepEqual(shots.map(s => s.dialogue), [
    '姐妹快来', '这件质感绝了', '上身真的显瘦', '配饰也很好挑', '周末快来逛',
  ]);
});

test('30 秒五镜脚本原样保留 4/6/8/7/5 秒时长', () => {
  const script30 = {
    hook: { scene: 'A', action: 'a', dialogue: 'd1', subtitle: 's1', image_index: 0, duration_s: 4 },
    scenes: [
      { scene: 'B', action: 'b', dialogue: 'd2', subtitle: 's2', image_index: 1, duration_s: 6 },
      { scene: 'C', action: 'c', dialogue: 'd3', subtitle: 's3', image_index: 2, duration_s: 8 },
      { scene: 'D', action: 'd', dialogue: 'd4', subtitle: 's4', image_index: 3, duration_s: 7 },
    ],
    outro: { scene: 'E', action: 'e', dialogue: 'd5', subtitle: 's5', image_index: 4, duration_s: 5 },
    total_duration_s: 30,
  };
  const shots = buildDirectorShotPlan(script30);
  assert.equal(shots.length, 5);
  assert.deepEqual(shots.map(s => s.duration), [4, 6, 8, 7, 5]);
  assert.equal(shots.reduce((sum, s) => sum + s.duration, 0), 30);
  assert.deepEqual(shots.flatMap(s => s.imageIndices), [0, 1, 2, 3, 4]);
});

test('不足 3 镜的脚本会被拒绝', () => {
  let message = '';
  try {
    buildDirectorShotPlan({ hook: script15.hook, scenes: [], total_duration_s: 3 });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.match(message, /至少需要 3 个有效分镜/);
});

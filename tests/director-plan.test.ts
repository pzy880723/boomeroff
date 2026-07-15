import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDirectorShotPlan } from '../supabase/functions/_shared/director-utils.ts';

const script = {
  hook: {
    scene: '商场走廊与门店门头',
    action: '博主边走进门店边喊',
    dialogue: '姐妹快来',
    subtitle: '周末探店',
    image_index: 0,
    duration_s: 3,
  },
  scenes: [
    {
      scene: '中古服饰货架',
      action: '博主拿起夹克展示细节',
      dialogue: '这件质感绝了',
      subtitle: '复古夹克',
      image_index: 1,
      duration_s: 3,
    },
    {
      scene: '穿衣镜前',
      action: '博主试穿后转身展示',
      dialogue: '上身真的显瘦',
      subtitle: '显瘦好搭',
      image_index: 2,
      duration_s: 3,
    },
    {
      scene: '配饰陈列区',
      action: '博主拿起配饰对镜头讲解',
      dialogue: '配饰也很好挑',
      subtitle: '细节加分',
      image_index: 3,
      duration_s: 3,
    },
  ],
  outro: {
    scene: '门店全景',
    action: '博主挥手并指向门店',
    dialogue: '周末快来逛',
    subtitle: '到店打卡',
    image_index: 4,
    duration_s: 3,
  },
  total_duration_s: 15,
};

test('15 秒脚本编译为三个独立的 5 秒 Seedance 镜头', () => {
  const shots = buildDirectorShotPlan(script);

  assert.equal(shots.length, 3);
  assert.deepEqual(shots.map((shot) => shot.duration), [5, 5, 5]);
  assert.equal(shots.reduce((sum, shot) => sum + shot.duration, 0), 15);
  assert.deepEqual(shots.flatMap((shot) => shot.sourceLabels), [
    '钩子', '镜头1', '镜头2', '镜头3', '收尾',
  ]);
  assert.deepEqual(shots.flatMap((shot) => shot.imageIndices), [0, 1, 2, 3, 4]);

  for (const line of ['姐妹快来', '这件质感绝了', '上身真的显瘦', '配饰也很好挑', '周末快来逛']) {
    assert.ok(shots.some((shot) => shot.prompt.includes(line)), `镜头提示词缺少脚本台词: ${line}`);
  }
});

test('不完整脚本不能降级为单次 15 秒生成', () => {
  let message = '';
  try {
    buildDirectorShotPlan({ hook: script.hook, scenes: [], total_duration_s: 15 });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert.match(message, /至少需要 3 个有效分镜/);
});

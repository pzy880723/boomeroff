import assert from 'node:assert/strict';
import test from 'node:test';

import {
  selectCurrentSurpriseTask,
  type SurpriseTaskRow,
} from '../supabase/functions/_shared/surprise-task-state.ts';

const row = (patch: Partial<SurpriseTaskRow>): SurpriseTaskRow => ({
  id: 'job-1',
  status: 'script_ready',
  created_at: '2026-07-29T10:00:00.000Z',
  updated_at: '2026-07-29T10:00:00.000Z',
  meta: {
    flow: 'surprise',
    consumed: false,
    surprise_stage: 'script_ready',
  },
  ...patch,
});

test('未消费的脚本草稿优先恢复，不能因为存在旧视频而新建脚本', () => {
  const current = selectCurrentSurpriseTask([
    row({
      id: 'old-video',
      status: 'done',
      created_at: '2026-07-28T10:00:00.000Z',
      meta: { flow: 'surprise', consumed: true, surprise_stage: 'video_queued' },
    }),
    row({ id: 'draft' }),
  ]);

  assert.equal(current?.kind, 'script');
  assert.equal(current?.job.id, 'draft');
});

test('本地缓存缺失时仍从数据库恢复正在生成或已完成的惊喜视频', () => {
  for (const status of ['shooting', 'composing', 'done']) {
    const current = selectCurrentSurpriseTask([
      row({
        id: `video-${status}`,
        status,
        meta: { flow: 'surprise', consumed: true, surprise_stage: 'video_queued' },
      }),
    ]);

    assert.equal(current?.kind, 'video');
    assert.equal(current?.job.id, `video-${status}`);
  }
});

test('用户明确点再拍一条后，已结束的视频不再阻挡新脚本', () => {
  const current = selectCurrentSurpriseTask([
    row({
      id: 'dismissed-video',
      status: 'done',
      created_at: '2026-07-29T11:00:00.000Z',
      meta: {
        flow: 'surprise',
        consumed: true,
        surprise_stage: 'video_queued',
        surprise_dismissed_at: '2026-07-29T11:00:00.000Z',
      },
    }),
    row({
      id: 'older-video',
      status: 'done',
      created_at: '2026-07-28T11:00:00.000Z',
      meta: { flow: 'surprise', consumed: true, surprise_stage: 'video_queued' },
    }),
  ]);

  assert.equal(current, null);
});

test('脚本生成失败后重新进入仍恢复同一任务，不能悄悄重复创建', () => {
  const current = selectCurrentSurpriseTask([
    row({
      id: 'failed-script',
      status: 'failed',
      meta: { flow: 'surprise', consumed: false, surprise_stage: 'failed' },
    }),
  ]);

  assert.equal(current?.kind, 'script');
  assert.equal(current?.job.id, 'failed-script');
});

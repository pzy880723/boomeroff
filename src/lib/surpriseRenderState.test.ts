import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSurpriseRenderState } from './surpriseRenderState.ts';

test('keeps a completed video in covering while its cover is queued', () => {
  const result = resolveSurpriseRenderState({
    status: 'succeeded',
    video_url: 'https://cdn/video.mp4',
    cover_status: 'queued',
  });

  assert.equal(result.phase, 'covering');
  assert.equal(result.videoUrl, 'https://cdn/video.mp4');
});

test('exposes cover progress while the cover worker is generating', () => {
  const result = resolveSurpriseRenderState({
    status: 'succeeded',
    video_url: 'https://cdn/video.mp4',
    cover_status: 'generating',
    cover_progress: { percent: 48, stage: 'seedream', message: '正在生成封面' },
  });

  assert.equal(result.phase, 'covering');
  assert.deepEqual(result.coverProgress, {
    percent: 48,
    stage: 'seedream',
    message: '正在生成封面',
  });
});

test('finishes only after a successful cover URL is available', () => {
  const result = resolveSurpriseRenderState({
    status: 'succeeded',
    video_url: 'https://cdn/video.mp4',
    cover_status: 'succeeded',
    cover_url: 'https://cdn/cover.jpg',
  });

  assert.equal(result.phase, 'done');
  assert.equal(result.coverUrl, 'https://cdn/cover.jpg');
});

test('does not accept a succeeded cover without its URL', () => {
  const result = resolveSurpriseRenderState({
    status: 'succeeded',
    video_url: 'https://cdn/video.mp4',
    cover_status: 'succeeded',
    cover_url: null,
  });

  assert.equal(result.phase, 'covering');
});

test('surfaces cover generation failure after video success', () => {
  const result = resolveSurpriseRenderState({
    status: 'succeeded',
    video_url: 'https://cdn/video.mp4',
    cover_status: 'failed',
    cover_error: 'Seedream 拒绝生成',
  });

  assert.equal(result.phase, 'failed');
  assert.equal(result.error, '视频已生成，但封面生成失败：Seedream 拒绝生成');
});

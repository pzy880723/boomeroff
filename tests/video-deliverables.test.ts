import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVideoDeliverables } from '../src/lib/videoDeliverables.ts';

test('成片和封面作为两个独立交付物', () => {
  assert.deepEqual(resolveVideoDeliverables({
    id: 'asset-12345678',
    output_url: 'https://cdn.example.com/final.mp4',
    meta: {
      cover_url: 'https://cdn.example.com/cover.png?token=1',
      poster_url: 'https://cdn.example.com/poster.jpg',
      storage_path: 'videos/final.mp4',
    },
  }), {
    video: {
      url: 'https://cdn.example.com/final.mp4',
      filename: 'final.mp4',
    },
    cover: {
      url: 'https://cdn.example.com/poster.jpg',
      filename: 'boomer-cover-asset-12.jpg',
    },
  });
});

test('没有 poster 时使用 cover_url', () => {
  const result = resolveVideoDeliverables({
    id: 'abcdef123456',
    output_url: 'https://cdn.example.com/video',
    meta: { cover_url: 'https://cdn.example.com/cover.webp' },
  });
  assert.equal(result.cover?.url, 'https://cdn.example.com/cover.webp');
  assert.equal(result.cover?.filename, 'boomer-cover-abcdef12.webp');
  assert.equal(result.video?.filename, 'boomer-video-abcdef12.mp4');
});

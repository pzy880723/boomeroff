import assert from 'node:assert/strict';
import test from 'node:test';

import {
  imageDimensionsFromMeta,
  imageOrientation,
  parseImageDimensions,
  probeImageDimensions,
  selectAssetsForVideoAspect,
} from '../supabase/functions/_shared/image-orientation.ts';

test('从新旧素材 meta 中读取图片宽高', () => {
  assert.deepEqual(imageDimensionsFromMeta({ image_width: 1080, image_height: 1920 }), {
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(imageDimensionsFromMeta({ image_dimensions: { width: 3024, height: 4032 } }), {
    width: 3024,
    height: 4032,
  });
});

test('9:16 只选择竖图，不允许横图、方图或未知尺寸回退', () => {
  const assets = [
    { id: 'portrait', meta: { image_width: 1080, image_height: 1920 } },
    { id: 'landscape', meta: { image_width: 1920, image_height: 1080 } },
    { id: 'square', meta: { image_width: 1200, image_height: 1200 } },
    { id: 'unknown', meta: {} },
  ];

  assert.equal(imageOrientation(1080, 1920), 'portrait');
  assert.equal(imageOrientation(1920, 1080), 'landscape');
  assert.equal(imageOrientation(1200, 1200), 'square');
  assert.deepEqual(selectAssetsForVideoAspect(assets, '9:16').map((asset) => asset.id), ['portrait']);
});

test('16:9 只选择横图，1:1 只选择近似方图', () => {
  const assets = [
    { id: 'portrait', meta: { image_width: 900, image_height: 1600 } },
    { id: 'landscape', meta: { image_width: 1600, image_height: 900 } },
    { id: 'square', meta: { image_width: 1000, image_height: 980 } },
  ];

  assert.deepEqual(selectAssetsForVideoAspect(assets, '16:9').map((asset) => asset.id), ['landscape']);
  assert.deepEqual(selectAssetsForVideoAspect(assets, '1:1').map((asset) => asset.id), ['square']);
});

test('直接从 PNG 和 JPEG 文件头读取尺寸', () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  new DataView(png.buffer).setUint32(16, 1080);
  new DataView(png.buffer).setUint32(20, 1920);
  assert.deepEqual(parseImageDimensions(png), { width: 1080, height: 1920 });

  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    0x07, 0x80,
    0x04, 0x38,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  assert.deepEqual(parseImageDimensions(jpeg), { width: 1080, height: 1920 });
});

test('远程探测请求使用 Range 并读取竖图尺寸', async () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  new DataView(png.buffer).setUint32(16, 1080);
  new DataView(png.buffer).setUint32(20, 1920);
  let requestedRange = '';
  const fetcher = (async (_url: string, init?: RequestInit) => {
    requestedRange = new Headers(init?.headers).get('Range') || '';
    return new Response(png);
  }) as typeof fetch;

  assert.deepEqual(await probeImageDimensions('https://cdn.example.com/photo.png', fetcher), {
    width: 1080,
    height: 1920,
  });
  assert.equal(requestedRange, 'bytes=0-131071');
});

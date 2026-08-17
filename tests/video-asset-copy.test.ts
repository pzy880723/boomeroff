import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveSavedVideoAssetCopy,
  resolveVideoAssetCopy,
  shouldGenerateVideoAssetCopy,
} from '../src/lib/videoAssetCopy.ts';

test('已保存 video_copy 优先，重复打开不会换文案', () => {
  const copy = resolveVideoAssetCopy({
    video_copy: { title: '固定标题', body: '固定正文', hashtags: ['#BOOMEROFF'] },
    publish_copy: { cover_title: '旧标题', caption: '旧正文' },
  });
  assert.deepEqual(copy, { title: '固定标题', body: '固定正文', hashtags: ['#BOOMEROFF'], first_comment: undefined });
});

test('Director publish_copy 只做一次确定性映射', () => {
  assert.deepEqual(resolveVideoAssetCopy({
    publish_copy: {
      cover_title: '封面标题',
      caption: '小红书正文',
      hashtags: ['#BOOMEROFF'],
    },
  }), { title: '封面标题', body: '小红书正文', hashtags: ['#BOOMEROFF'], first_comment: undefined });
});

test('旧 publish_copy 只能临时展示，不能冒充已生成的新版广告文案', () => {
  const meta = {
    publish_copy: {
      title: '旧短标题',
      body: '旧短正文',
      topics: ['#旧话题'],
    },
  };

  assert.equal(resolveSavedVideoAssetCopy(meta), null);
  assert.equal(shouldGenerateVideoAssetCopy(meta), true);
  assert.equal(resolveVideoAssetCopy(meta)?.title, '旧短标题');
});

test('已保存 video_copy 正常命中缓存，显式重写仍会生成', () => {
  const meta = {
    video_copy: {
      title: '新版标题',
      body: '新版正文',
      hashtags: ['#BOOMEROFF'],
    },
  };

  assert.equal(resolveSavedVideoAssetCopy(meta)?.title, '新版标题');
  assert.equal(shouldGenerateVideoAssetCopy(meta), false);
  assert.equal(shouldGenerateVideoAssetCopy(meta, true), true);
});

test('旧素材 meta 没有文案时从当次生成脚本恢复固定文案', () => {
  assert.deepEqual(resolveVideoAssetCopy(
    { status: 'succeeded' },
    {
      title: '门店打卡',
      publish_copy: {
        title: '上海藏着这家中古店',
        body: '三万件中古好物，来 BOOMER OFF 慢慢淘。',
        topics: ['#上海探店', '#BOOMEROFF'],
      },
    },
  ), {
    title: '上海藏着这家中古店',
    body: '三万件中古好物，来 BOOMER OFF 慢慢淘。',
    hashtags: ['#上海探店', '#BOOMEROFF'],
    first_comment: undefined,
  });
});

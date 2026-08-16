import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeLockedPublishCopy,
  formatLockedShopBlock,
} from '../supabase/functions/_shared/publish-copy-template.ts';

const shop = {
  name: 'BOOMER OFF vintage 中信泰富店',
  address: '上海市静安区南京西路1168号 中信泰富广场 B1层 B16，近泰兴路',
  business_hours: '每天 10:00–22:00',
};

test('固定门店块只使用数据库门店字段', () => {
  assert.equal(
    formatLockedShopBlock(shop),
    [
      '📍 BOOMER OFF vintage 中信泰富店',
      '🏢 上海市静安区南京西路1168号 中信泰富广场 B1层 B16，近泰兴路',
      '🕙 营业时间：每天 10:00–22:00',
    ].join('\n'),
  );
});

test('AI 动态正文中的伪地址和伪营业时间会被移除再追加固定门店块', () => {
  const result = composeLockedPublishCopy({
    title: '谁懂啊！翻筐真的会上头🧸',
    body: [
      '本来只想随便看看，结果每只筐都舍不得错过！👀',
      '📍 假门店：北京路99号',
      '营业时间：每天 08:00–24:00',
      '老玩具、复古杯盘和唱片，每走一步都有新发现✨',
    ].join('\n'),
    hashtags: ['#中古店', '#BOOMEROFF', '#中古店'],
    first_comment: '地址：假地址；营业到凌晨两点',
  }, shop);

  assert.doesNotMatch(result.body, /北京路99号|08:00|24:00/);
  assert.match(result.body, /老玩具、复古杯盘和唱片/);
  assert.ok(result.body.endsWith(formatLockedShopBlock(shop)));
  assert.equal(result.first_comment, '你最想在店里淘到什么？👀');
  assert.deepEqual(result.hashtags, ['#BOOMEROFF', '#中古店']);
  assert.deepEqual(result.shop_details, {
    ...shop,
    block: formatLockedShopBlock(shop),
    locked: true,
  });
});

test('重复处理缓存文案不会重复追加固定门店块', () => {
  const first = composeLockedPublishCopy({
    title: '淘货真的会上头',
    body: `动态正文\n\n${formatLockedShopBlock(shop)}`,
    hashtags: ['#BOOMEROFF'],
    first_comment: '',
  }, shop);
  const second = composeLockedPublishCopy(first, shop);

  assert.equal(second.body.match(/📍/g)?.length, 1);
  assert.equal(second.body.match(/营业时间：/g)?.length, 1);
});

test('没有绑定门店时不编造地址和营业时间', () => {
  const result = composeLockedPublishCopy({
    title: '中古店寻宝',
    body: '今天翻到了很有意思的老物件✨',
    hashtags: [],
  }, null);

  assert.equal(result.body, '今天翻到了很有意思的老物件✨');
  assert.deepEqual(result.shop_details, { locked: false, block: '' });
});

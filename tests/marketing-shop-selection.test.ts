import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMarketingShop } from '../src/lib/marketingShopSelection.ts';

const shops = ['shop-a', 'shop-b', 'shop-c'];

test('绑定门店用户首次进入默认使用绑定门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: 'shop-b',
    sessionShopId: null,
    rememberedShopId: 'shop-c',
    canSwitch: false,
  }), 'shop-b');
});

test('普通店员不能被会话缓存切换到其他门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: 'shop-b',
    sessionShopId: 'shop-c',
    rememberedShopId: null,
    canSwitch: false,
  }), 'shop-b');
});

test('未绑定门店的普通店员不自动落到任意门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: null,
    sessionShopId: null,
    rememberedShopId: 'shop-c',
    canSwitch: false,
  }), null);
});

test('管理员恢复本次会话选择并允许跨店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: 'shop-b',
    sessionShopId: 'shop-c',
    rememberedShopId: null,
    canSwitch: true,
  }), 'shop-c');
});

test('管理员保存的门店失效时回退到第一家有效门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: 'old-shop',
    sessionShopId: 'missing-shop',
    rememberedShopId: 'deleted-shop',
    canSwitch: true,
  }), 'shop-a');
});

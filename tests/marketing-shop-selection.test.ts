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
  }), 'shop-b');
});

test('绑定门店用户手动切换后，本次营销中心会话继续使用所选门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: 'shop-b',
    sessionShopId: 'shop-c',
    rememberedShopId: null,
  }), 'shop-c');
});

test('未绑定门店用户恢复自己上一次选择的有效门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: null,
    sessionShopId: null,
    rememberedShopId: 'shop-c',
  }), 'shop-c');
});

test('保存的门店已停用时回退到第一家有效门店', () => {
  assert.equal(resolveMarketingShop({
    shopIds: shops,
    boundShopId: 'old-shop',
    sessionShopId: 'missing-shop',
    rememberedShopId: 'deleted-shop',
  }), 'shop-a');
});

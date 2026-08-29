import assert from 'node:assert/strict';
import test from 'node:test';

import { canAccessStore } from '../supabase/functions/_shared/store-access.ts';

test('普通店员只能访问绑定门店', () => {
  assert.equal(canAccessStore({
    legacyRole: 'anchor',
    roleCode: 'staff',
    boundShopId: 'shop-a',
    requestedShopId: 'shop-a',
  }), true);
  assert.equal(canAccessStore({
    legacyRole: 'anchor',
    roleCode: 'staff',
    boundShopId: 'shop-a',
    requestedShopId: 'shop-b',
  }), false);
});

test('未绑定门店或停用账号不能访问门店数据', () => {
  assert.equal(canAccessStore({
    legacyRole: 'anchor',
    roleCode: 'staff',
    boundShopId: null,
    requestedShopId: 'shop-a',
  }), false);
  assert.equal(canAccessStore({
    legacyRole: 'admin',
    roleCode: 'super_admin',
    suspended: true,
    requestedShopId: 'shop-a',
  }), false);
});

test('管理角色可以跨店访问', () => {
  for (const roleCode of ['super_admin', 'area_manager', 'shop_manager']) {
    assert.equal(canAccessStore({
      legacyRole: roleCode === 'super_admin' ? 'admin' : 'anchor',
      roleCode,
      boundShopId: 'shop-a',
      requestedShopId: 'shop-b',
    }), true);
  }
});

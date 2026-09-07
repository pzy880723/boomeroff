import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidNonce,
  parseScopePayload,
  timestampWithinWindow,
  timingSafeEqualStr,
} from '../supabase/functions/_shared/erp-scope.ts';
import { shouldRunErpScopeSync, ERP_SCOPE_THROTTLE_MS } from '../src/lib/erpScopeThrottle.ts';

const GO_SHOP = '72c80d98-0000-4000-8000-000000000001';
const ERP_LOC = '7111b585-7d7f-4777-b4ae-61ce2b868f78';
const ERP_USER = '47239464-9c3f-4104-95d8-5f251fc803fe';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    erp_user_id: ERP_USER,
    active: true,
    revoked: false,
    roles: ['store_staff'],
    permissions: ['aigc_access'],
    scope_version: 3,
    updated_at: '2026-09-07T18:00:00Z',
    shops: [{ go_shop_id: GO_SHOP, erp_location_id: ERP_LOC, name: '中信泰富店' }],
    ...overrides,
  };
}

test('GREEN: 合法新契约 payload 通过解析', () => {
  const res = parseScopePayload(payload());
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.payload.shops[0].go_shop_id, GO_SHOP);
    assert.equal(res.payload.scope_version, 3);
  }
});

test('RED: 旧 {id} 结构不再被接受', () => {
  const res = parseScopePayload(payload({ shops: [{ id: ERP_LOC, name: '中信泰富店' }] }));
  assert.deepEqual(res, { ok: false, code: 'invalid_shop_mapping' });
});

test('RED: 合法+非法混合门店整份拒绝，不静默缩权限', () => {
  const res = parseScopePayload(payload({
    shops: [
      { go_shop_id: GO_SHOP, erp_location_id: ERP_LOC, name: 'A' },
      { go_shop_id: 'not-a-uuid', erp_location_id: ERP_LOC, name: 'B' },
    ],
  }));
  assert.deepEqual(res, { ok: false, code: 'invalid_shop_mapping' });
});

test('RED: 缺 erp_location_id 也整份拒绝', () => {
  const res = parseScopePayload(payload({ shops: [{ go_shop_id: GO_SHOP, name: 'A' }] }));
  assert.deepEqual(res, { ok: false, code: 'invalid_shop_mapping' });
});

test('RED: 缺 active/revoked 状态位拒绝', () => {
  assert.deepEqual(parseScopePayload(payload({ revoked: undefined })), {
    ok: false, code: 'invalid_status',
  });
});

test('RED: scope_version 非法拒绝', () => {
  assert.deepEqual(parseScopePayload(payload({ scope_version: '3' })), {
    ok: false, code: 'invalid_scope_version',
  });
  assert.deepEqual(parseScopePayload(payload({ scope_version: -1 })), {
    ok: false, code: 'invalid_scope_version',
  });
});

test('GREEN: 撤销 payload 合法（墓碑输入）', () => {
  const res = parseScopePayload(payload({ revoked: true, active: false, roles: [], shops: [] }));
  assert.equal(res.ok, true);
});

test('timestamp 只接受 ±5 分钟窗', () => {
  const now = Date.parse('2026-09-07T18:00:00Z');
  assert.equal(timestampWithinWindow('2026-09-07T17:57:00Z', now), true);
  assert.equal(timestampWithinWindow('2026-09-07T17:50:00Z', now), false);
  assert.equal(timestampWithinWindow('2026-09-07T18:10:00Z', now), false);
  assert.equal(timestampWithinWindow(undefined, now), false);
});

test('nonce 格式校验', () => {
  assert.equal(isValidNonce('abcd1234-EF_gh'), true);
  assert.equal(isValidNonce('short'), false);
  assert.equal(isValidNonce('bad nonce!!'), false);
});

test('secret 比较恒定时间且结果正确', () => {
  assert.equal(timingSafeEqualStr('abc123', 'abc123'), true);
  assert.equal(timingSafeEqualStr('abc123', 'abc124'), false);
  assert.equal(timingSafeEqualStr('abc', 'abc123'), false);
  assert.equal(timingSafeEqualStr('', 'abc123'), false);
});

test('Web 续租 30 秒节流', () => {
  assert.equal(ERP_SCOPE_THROTTLE_MS, 30_000);
  assert.equal(shouldRunErpScopeSync(100_000, 80_000), false);
  assert.equal(shouldRunErpScopeSync(100_000, 60_000), true);
  assert.equal(shouldRunErpScopeSync(100_000, 0), true);
});

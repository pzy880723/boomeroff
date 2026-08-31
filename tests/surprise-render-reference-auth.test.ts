import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAuthorizedSurpriseReferences } from '../supabase/functions/_shared/surprise-render-references.ts';

const storefront = {
  id: 'front',
  output_url: 'front.jpg',
  output_text: 'BOOMER·OFF 门店入口全景与店招',
  tags: ['探店首图', '门头全景', '店招'],
  category: '门店',
};

test('最终渲染只接受当前门店数据库中存在的参考图', () => {
  assert.throws(
    () => selectAuthorizedSurpriseReferences(
      [{ asset_id: 'front', url: 'front.jpg' }, { asset_id: 'other-shop', url: 'other.jpg' }],
      [storefront],
    ),
    /部分参考图不属于当前门店/,
  );
});

test('最终渲染忽略客户端伪造的 storefront 角色并把数据库真实门头排第一', () => {
  const interior = {
    id: 'inside',
    output_url: 'inside.jpg',
    output_text: '店内唱片与玩具货架',
    tags: ['店内陈列'],
    category: '店铺',
  };
  const result = selectAuthorizedSurpriseReferences(
    [
      { asset_id: 'inside', url: 'inside.jpg', role: 'storefront' },
      { asset_id: 'front', url: 'front.jpg', role: 'scene' },
    ],
    [interior, storefront],
  );

  assert.deepEqual(result.map((item) => item.id), ['front', 'inside']);
});

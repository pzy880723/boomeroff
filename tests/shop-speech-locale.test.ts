import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildShopSpeechInstruction,
  resolveShopSpeechLocale,
} from '../supabase/functions/_shared/shop-speech-locale.ts';

test('温州朔门门店使用温州鹿城区属地规则', () => {
  const locale = resolveShopSpeechLocale({
    name: '温州朔门古港店',
    description: '温州朔门古港中古杂货铺',
  });
  assert.deepEqual(locale, {
    city: '温州',
    district: '鹿城区',
    dialect: '温州鹿城区方言',
  });
});

test('上海中信泰富门店从地址识别静安区', () => {
  const locale = resolveShopSpeechLocale({
    name: '上海中信泰富店',
    address: '上海市静安区南京西路1168号中信泰富广场B1',
  });
  assert.equal(locale.city, '上海');
  assert.equal(locale.district, '静安区');
  assert.equal(locale.dialect, '上海话');
});

test('默认普通话，只有明确要求方言才使用门店方言', () => {
  const shop = { name: '温州朔门古港店' };
  const standard = buildShopSpeechInstruction(shop, '瓷器说得热情一点');
  const dialect = buildShopSpeechInstruction(shop, '改成用本地方言讲');
  assert.match(standard, /普通话/);
  assert.match(standard, /不得自行加入方言/);
  assert.match(dialect, /温州鹿城区方言/);
  assert.match(dialect, /对白与字幕逐字一致/);
});

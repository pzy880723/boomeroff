import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildShopSpeechInstruction,
  resolveShopSpeechLocale,
} from './shop-speech-locale.ts';

Deno.test('温州门店即使没有结构化地址也解析为温州鹿城区', () => {
  const locale = resolveShopSpeechLocale({
    name: '温州朔门古港店',
    address: null,
    profile_description: '温州朔门古港中古杂货铺',
  });

  assertEquals(locale.city, '温州');
  assertEquals(locale.district, '鹿城区');
  assertEquals(locale.dialect, '温州鹿城区方言');
});

Deno.test('上海门店从真实地址读取静安区', () => {
  const locale = resolveShopSpeechLocale({
    name: '上海中信泰富店',
    address: '上海市静安区南京西路1168号中信泰富广场B1',
  });

  assertEquals(locale.city, '上海');
  assertEquals(locale.district, '静安区');
  assertEquals(locale.dialect, '上海话');
});

Deno.test('未明确要求方言时固定使用普通话', () => {
  const instruction = buildShopSpeechInstruction({
    name: '温州朔门古港店',
    address: null,
  }, '把瓷器卖点说热情一点');

  assertStringIncludes(instruction, '普通话');
  assertStringIncludes(instruction, '不得自行加入方言');
});

Deno.test('明确要求方言时使用当前门店所在区县方言', () => {
  const instruction = buildShopSpeechInstruction({
    name: '温州朔门古港店',
    address: null,
  }, '这条改成用本地方言讲');

  assertStringIncludes(instruction, '温州鹿城区方言');
  assertStringIncludes(instruction, '对白与字幕逐字一致');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSurpriseContentScope } from '../supabase/functions/_shared/surprise-content-scope.ts';
import { shouldStopSurpriseImageProbing } from '../supabase/functions/_shared/surprise-image-probe.ts';

const portrait = (id: string, category: string, tags: string[] = []) => ({
  id,
  category,
  tags,
  meta: { image_width: 1080, image_height: 1920 },
});

test('指定品类未准备足够竖图时不能因为总竖图够了就提前停止', () => {
  const assets = [
    portrait('door', '店铺', ['探店首图', '门头全景', '店招']),
    ...Array.from({ length: 8 }, (_, index) => portrait(`toy-${index}`, '玩具', ['玩具'])),
  ];

  assert.equal(
    shouldStopSurpriseImageProbing(assets, '9:16', resolveSurpriseContentScope('ceramics')),
    false,
  );
});

test('指定品类已有三张竖图且门头与总量充足时允许停止', () => {
  const assets = [
    portrait('door', '店铺', ['探店首图', '门头全景', '店招']),
    ...Array.from({ length: 5 }, (_, index) => portrait(`toy-${index}`, '玩具', ['玩具'])),
    ...Array.from({ length: 3 }, (_, index) => portrait(`cup-${index}`, '瓷器', ['瓷器', '杯碟'])),
  ];

  assert.equal(
    shouldStopSurpriseImageProbing(assets, '9:16', resolveSurpriseContentScope('ceramics')),
    true,
  );
});

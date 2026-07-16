import assert from 'node:assert/strict';
import test from 'node:test';

import { SURPRISE_DEFAULT_VIDEO_PREFS } from '../src/lib/videoModelPrefs.ts';
import {
  DEFAULT_SEEDANCE_2,
  resolveSeedanceQuality,
} from '../supabase/functions/_shared/seedance-models.ts';

test('惊喜一下默认真实使用 Seedance Pro 1080p，Fast 只在显式选择时回落 720p', () => {
  assert.deepEqual(SURPRISE_DEFAULT_VIDEO_PREFS, {
    modelId: DEFAULT_SEEDANCE_2,
    resolution: '1080p',
  });

  const standard = resolveSeedanceQuality();
  assert.equal(standard.model.id, DEFAULT_SEEDANCE_2);
  assert.equal(standard.requestedResolution, '1080p');
  assert.equal(standard.resolution, '1080p');
  assert.equal(standard.resolutionDowngraded, false);

  const explicitFast = resolveSeedanceQuality(
    'doubao-seedance-2-0-fast-260128',
    '1080p',
  );
  assert.equal(explicitFast.model.id, 'doubao-seedance-2-0-fast-260128');
  assert.equal(explicitFast.resolution, '720p');
  assert.equal(explicitFast.resolutionDowngraded, true);
});

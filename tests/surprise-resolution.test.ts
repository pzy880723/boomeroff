import { describe, it, expect } from 'vitest';
import { buildSurpriseRenderBody, SURPRISE_OUTPUT_RESOLUTION } from '../src/api/surpriseScriptJob';
import { SURPRISE_DEFAULT_VIDEO_PREFS } from '../src/lib/videoModelPrefs';

const base = {
  shop_id: 's1',
  script: {},
  picked_assets: [],
  style: 'energetic',
  realism: 'photoreal',
  model: 'doubao-seedance-2-0-260128',
};

describe('BOOMER 帮我拍 输出分辨率', () => {
  it('默认偏好为 1080p', () => {
    expect(SURPRISE_DEFAULT_VIDEO_PREFS.resolution).toBe('1080p');
    expect(SURPRISE_OUTPUT_RESOLUTION).toBe('1080p');
  });

  it('缺省 resolution 时兜底 1080p', () => {
    expect(buildSurpriseRenderBody({ ...base }).resolution).toBe('1080p');
  });

  it('显式 720p 会被强制提升到 1080p', () => {
    expect(buildSurpriseRenderBody({ ...base, resolution: '720p' }).resolution).toBe('1080p');
  });

  it('保留 preview=false 的一段直出提交语义', () => {
    expect(buildSurpriseRenderBody({ ...base }).preview).toBe(false);
  });
});

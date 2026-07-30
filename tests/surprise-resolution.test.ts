import { describe, it, expect, beforeAll } from 'vitest';

const base = {
  shop_id: 's1',
  script: {},
  picked_assets: [],
  style: 'energetic',
  realism: 'photoreal',
  model: 'doubao-seedance-2-0-260128',
};

let buildSurpriseRenderBody: (p: any) => Record<string, unknown>;
let SURPRISE_OUTPUT_RESOLUTION: string;
let SURPRISE_DEFAULT_VIDEO_PREFS: { resolution: string };

beforeAll(async () => {
  // supabase client 在模块顶层读取 localStorage,Node 环境下需要最小桩。
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  const api = await import('../src/api/surpriseScriptJob');
  buildSurpriseRenderBody = api.buildSurpriseRenderBody;
  SURPRISE_OUTPUT_RESOLUTION = api.SURPRISE_OUTPUT_RESOLUTION;
  SURPRISE_DEFAULT_VIDEO_PREFS = (await import('../src/lib/videoModelPrefs')).SURPRISE_DEFAULT_VIDEO_PREFS;
});

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

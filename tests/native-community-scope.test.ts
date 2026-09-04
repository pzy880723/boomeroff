import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('native app does not expose the community route or entry points', () => {
  const app = read('src/App.tsx');
  const grid = read('src/components/home/AppGrid.tsx');
  const feed = read('src/components/home/HomeFeedTabs.tsx');
  const share = read('src/components/community/ShareToCommunityButton.tsx');

  assert.match(app, /isNativeApp \? <Navigate to="\/" replace \/> : <Community \/>/);
  assert.match(grid, /!isNativeApp \|\| id !== 'community'/);
  assert.match(feed, /!isNativeApp && \(/);
  assert.match(share, /Capacitor\.isNativePlatform\(\)\) return null/);
});

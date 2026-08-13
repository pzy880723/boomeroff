import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('native app release URL bypasses stale WebView entry cache', () => {
  const config = readFileSync('capacitor.config.ts', 'utf8');
  assert.match(config, /ai\.boomeroff\.com\/\?native_release=\d{8}_\d+/);
});

test('production nginx never caches index.html but keeps hashed assets immutable', () => {
  const config = readFileSync('deploy/nginx/ai-boomeroff.com.conf', 'utf8');
  assert.match(config, /location \/ \{[\s\S]*Cache-Control "no-store, no-cache, must-revalidate, max-age=0"/);
  assert.match(config, /location \/assets\/[\s\S]*Cache-Control "public, immutable"/);
});

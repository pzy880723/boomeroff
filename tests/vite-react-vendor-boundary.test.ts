import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

test('production build leaves vendor chunk ownership to Rollup', () => {
  assert.doesNotMatch(config, /manualChunks/);
});

test('React and React DOM resolve to one runtime copy', () => {
  assert.match(config, /dedupe:\s*\["react",\s*"react-dom"\]/);
});

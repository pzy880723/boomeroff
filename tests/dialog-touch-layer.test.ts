import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/ui/dialog.tsx', import.meta.url),
  'utf8',
);

test('dialog content stays above its overlay and accepts touch input on iOS', () => {
  assert.match(source, /z-\[51\]/);
  assert.match(source, /pointer-events-auto/);
});

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'jsdom',
    include: ['tests/erp-scope-auth.test.tsx', 'tests/erp-scope-sync.test.ts', 'tests/erp-bootstrap-guard.test.ts'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
  },
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('惊喜视频只查询 marketing_assets 的真实文本字段 output_text', () => {
  const sources = [
    read('../supabase/functions/surprise-marketing-video/index.ts'),
    read('../supabase/functions/surprise-script-job/index.ts'),
  ];

  for (const source of sources) {
    const selects = [...source.matchAll(/\.from\(["']marketing_assets["']\)[\s\S]{0,180}?\.select\((["'`])([^"'`]+)\1\)/g)]
      .map((match) => match[2]);
    assert.ok(selects.length > 0, '应当找到 marketing_assets 查询');
    assert.ok(selects.every((fields) => !fields.split(/\s*,\s*/).includes('description')));
    assert.ok(selects.some((fields) => fields.split(/\s*,\s*/).includes('output_text')));
  }
});

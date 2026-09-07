import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const run = (source: string, context: Record<string, unknown>) => new Function(
  ...Object.keys(context), ts.transpile(source, { target: ts.ScriptTarget.ES2022 }),
)(...Object.values(context));
const days = Array.from({ length: 7 }, (_, i) => `2026-09-${7 + i < 10 ? '0' : ''}${7 + i}`);
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

test('manual scheduling allows a seventh day but preserves cross-store conflicts and time off', () => {
  const source = read('src/components/admin/ScheduleManager.tsx');
  const code = source.slice(source.indexOf('  const validateAssign ='), source.indexOf('  const addAssign ='));
  const user = { user_id: 'employee', display_name: 'Test', max_per_week: 5, day_offs: [days[5]] };
  const validate = run(`${code}\nreturn validateAssign;`, {
    dowOf: dow, weekdayLabel: (d: string) => d, shopId: 'shop',
    weekCountOf: () => 6,
    allWeekScheds: days.slice(0, 6).map(work_date => ({ user_id: 'employee', work_date, shop_id: 'other' })),
  });
  assert.deepEqual(validate(days[6], 'A', user), { hard: [], soft: [] });
  assert.equal(validate(days[0], 'A', user).hard.length, 1);
  assert.equal(validate(days[5], 'A', user).soft.length, 1);
});

test('AI scheduling retains all seven days while excluding duplicate and forbidden assignments', () => {
  const source = read('supabase/functions/generate-schedule/index.ts');
  const code = source.slice(source.indexOf('    const validShifts ='), source.indexOf('    if (rows.length)'));
  const staff = { user_id: 'employee', max_per_week: 5, blocked_shifts: ['B'], blocked_weekdays: [], day_offs: [], available_weekdays: [0,1,2,3,4,5,6] };
  const execute = (overrides = {}) => run(`${code}\nreturn rows;`, {
    shifts: [{ code: 'A' }, { code: 'B' }], staffList: [staff], days, dow,
    assignments: [...days.map(date => ({ date, shift_code: 'A', user_ids: ['employee'] })), { date: days[0], shift_code: 'A', user_ids: ['employee'] }],
    occupiedUserDate: new Set(), weekCountByUser: new Map(), shopId: 'shop', userData: { user: { id: 'admin' } }, ...overrides,
  });
  assert.equal(execute().length, 7);
  assert.equal(execute({ occupiedUserDate: new Set([`${days[0]}_employee`]) }).length, 6);
  assert.equal(execute({ staffList: [{ ...staff, day_offs: [days[1]] }] }).length, 6);
  assert.equal(execute({ assignments: [{ date: days[0], shift_code: 'B', user_ids: ['employee'] }] }).length, 0);
});

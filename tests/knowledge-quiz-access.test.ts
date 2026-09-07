import { describe, it, expect } from 'vitest';
import {
  assertQuizSourceReadable,
  assertNotSuspended,
  isValidKind,
  QuizAccessError,
} from '../supabase/functions/_shared/quiz-access.ts';

const ME = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

describe('quiz source access', () => {
  it('rejects unknown kind', () => {
    expect(isValidKind('products')).toBe(false);
    expect(isValidKind('favorite')).toBe(true);
  });

  it('rejects suspended account (any row suspended)', () => {
    expect(() => assertNotSuspended([{ suspended: true }])).toThrow(QuizAccessError);
    expect(() => assertNotSuspended([{ suspended: false }, { suspended: true }])).toThrow(/停用/);
    try {
      assertNotSuspended([{ suspended: true }]);
    } catch (e: any) {
      expect(e.status).toBe(403);
    }
  });

  it('allows active account, including multiple non-suspended rows', () => {
    expect(() => assertNotSuspended([{ suspended: false }])).not.toThrow();
    expect(() => assertNotSuspended([{ suspended: false }, { suspended: null }])).not.toThrow();
  });

  it('allows account with no role row (existing account rule)', () => {
    expect(() => assertNotSuspended([])).not.toThrow();
  });

  it('fails closed with 503 when the suspension lookup errors or returns null', () => {
    for (const call of [
      () => assertNotSuspended(null, { message: 'db down' }),
      () => assertNotSuspended([{ suspended: false }], { message: 'db down' }),
      () => assertNotSuspended(null),
      () => assertNotSuspended(undefined),
    ]) {
      try {
        call();
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(QuizAccessError);
        expect(e.status).toBe(503);
      }
    }
  });


  it("rejects another user's favorite", () => {
    try {
      assertQuizSourceReadable('favorite', { user_id: OTHER }, ME);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(QuizAccessError);
      expect(e.status).toBe(403);
    }
  });

  it('rejects favorite invisible under RLS (null row)', () => {
    expect(() => assertQuizSourceReadable('favorite', null, ME)).toThrow(/无权/);
  });

  it('allows own favorite', () => {
    expect(() => assertQuizSourceReadable('favorite', { user_id: ME }, ME)).not.toThrow();
  });

  it('rejects knowledge/official not readable under RLS', () => {
    expect(() => assertQuizSourceReadable('knowledge', null, ME)).toThrow(/无权/);
    expect(() => assertQuizSourceReadable('official', undefined, ME)).toThrow(/无权/);
  });

  it('allows readable knowledge/official rows', () => {
    expect(() => assertQuizSourceReadable('knowledge', {}, ME)).not.toThrow();
    expect(() => assertQuizSourceReadable('official', {}, ME)).not.toThrow();
  });
});

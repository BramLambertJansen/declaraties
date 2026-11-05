import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { assert, AssertionError } from './assert.ts';
import { UserId, brandedId } from './ids.ts';
import { cents } from './money.ts';
import { unsafeCast } from './unsafe-cast.ts';

describe('assert, unsafeCast, Cents, branded IDs (framework §4, §5)', () => {
  test('assert gooit een AssertionError met de melding', () => {
    expect(() => {
      assert(false, 'hoort niet');
    }).toThrow(AssertionError);
    expect(() => {
      assert(1, 'ok');
    }).not.toThrow();
  });

  test('unsafeCast eist een reden', () => {
    expect(unsafeCast<number>(1, 'test: bewust zonder schema')).toBe(1);
    expect(() => unsafeCast<number>(1, 'kort')).toThrow('reden');
  });

  test('Cents: alleen gehele, veilige getallen', () => {
    expect(cents(1999)).toBe(1999);
    expect(() => cents(19.99)).toThrow(z.ZodError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(z.ZodError);
  });

  test('branded IDs: niet leeg; een app maakt eigen IDs met brandedId', () => {
    expect(UserId.parse('u1')).toBe('u1');
    expect(() => UserId.parse('')).toThrow(z.ZodError);
    expect(brandedId('NoteId').parse('n1')).toBe('n1');
  });
});

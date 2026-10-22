import { describe, expect, test } from 'vitest';
import { coreErrorCodes, defineErrorCodes } from './errors.ts';

describe('defineErrorCodes (uitbreidingsplek, ADR 0040)', () => {
  test('een app voegt codes toe zonder core te wijzigen', () => {
    const registry = defineErrorCodes(['NOTE_LOCKED']);

    expect(registry.codes).toStrictEqual([...coreErrorCodes, 'NOTE_LOCKED']);
    expect(registry.is('NOTE_LOCKED')).toBe(true);
    expect(registry.is('FORBIDDEN')).toBe(true);
    expect(registry.is('ONBEKEND')).toBe(false);
  });

  test.each([
    [['FORBIDDEN'], 'bestaat al in core'],
    [['note_locked'], 'SCREAMING_SNAKE_CASE'],
    [['A', 'A'], 'Dubbele foutcode'],
  ])('weigert %j', (codes, message) => {
    expect(() => defineErrorCodes(codes)).toThrow(message);
  });
});

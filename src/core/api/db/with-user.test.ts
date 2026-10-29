import { describe, expect, test } from 'vitest';
import { checkActor } from './with-user.ts';

describe('checkActor', () => {
  test.each(['password', 'mfa'])('laat sessiesterkte %s door', (sessionStrength) => {
    expect(() => {
      checkActor({ userId: 'u1', sessionStrength });
    }).not.toThrow();
  });

  test.each(['none', '', 'MFA', 'admin'])('weigert sessiesterkte %j', (sessionStrength) => {
    expect(() => {
      checkActor({ userId: 'u1', sessionStrength });
    }).toThrow('ongeldige sessiesterkte');
  });

  test('weigert een lege userId', () => {
    expect(() => {
      checkActor({ userId: '', sessionStrength: 'mfa' });
    }).toThrow('lege userId');
  });
});

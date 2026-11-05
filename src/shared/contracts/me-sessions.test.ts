import { describe, expect, test } from 'vitest';
import {
  confirmEmailContract,
  revokeOtherSessionsContract,
  revokeSessionContract,
  sessionItem,
  sessionsListContract,
} from './me.ts';

// Spec eigen-account: de contracten van sessies en e-mailbevestiging (grenzen, strict, geen tokens in de uitvoer).
describe('revokeSessionContract', () => {
  test('een ID van 1 tot 200 tekens', () => {
    expect(revokeSessionContract.input.safeParse({ id: 'a' }).success).toBe(true);
    expect(revokeSessionContract.input.safeParse({ id: 'a'.repeat(200) }).success).toBe(true);
    expect(revokeSessionContract.input.safeParse({ id: '' }).success).toBe(false);
    expect(revokeSessionContract.input.safeParse({ id: 'a'.repeat(201) }).success).toBe(false);
  });

  test('strict: geen userId of token erbij', () => {
    expect(revokeSessionContract.input.safeParse({ id: 'a', userId: 'ander' }).success).toBe(false);
    expect(revokeSessionContract.input.safeParse({ id: 'a', token: 'x' }).success).toBe(false);
  });
});

test('revokeOtherSessionsContract: lege, strikte invoer', () => {
  expect(revokeOtherSessionsContract.input.safeParse({}).success).toBe(true);
  expect(revokeOtherSessionsContract.input.safeParse({ userId: 'ander' }).success).toBe(false);
});

describe('confirmEmailContract', () => {
  test('een token van 1 tot 2000 tekens, strict', () => {
    expect(confirmEmailContract.input.safeParse({ token: 'a' }).success).toBe(true);
    expect(confirmEmailContract.input.safeParse({ token: 'a'.repeat(2000) }).success).toBe(true);
    expect(confirmEmailContract.input.safeParse({ token: '' }).success).toBe(false);
    expect(confirmEmailContract.input.safeParse({ token: 'a'.repeat(2001) }).success).toBe(false);
    expect(confirmEmailContract.input.safeParse({ token: 'a', newEmail: 'x@y.test' }).success).toBe(false);
  });

  test('de uitvoer is stap "oud" of "nieuw"', () => {
    expect(confirmEmailContract.output.safeParse({ stap: 'oud' }).success).toBe(true);
    expect(confirmEmailContract.output.safeParse({ stap: 'nieuw' }).success).toBe(true);
    expect(confirmEmailContract.output.safeParse({ stap: 'twee' }).success).toBe(false);
  });
});

describe('sessionsListContract', () => {
  const item = {
    id: 's1',
    apparaat: 'Firefox op Windows',
    aangemaakt: '2026-10-11T10:00:00Z',
    laatstActief: '2026-10-11T11:00:00Z',
    huidig: true,
  };

  test('een item heeft precies id, apparaat, aangemaakt, laatstActief en huidig', () => {
    expect(sessionItem.safeParse(item).success).toBe(true);
    expect(Object.keys(sessionItem.shape).sort()).toStrictEqual([
      'aangemaakt',
      'apparaat',
      'huidig',
      'id',
      'laatstActief',
    ]);
  });

  test('geen token, IP of user-agent naar de browser: strict', () => {
    expect(sessionItem.safeParse({ ...item, token: 'geheim' }).success).toBe(false);
    expect(sessionItem.safeParse({ ...item, ipAddress: '10.0.0.1' }).success).toBe(false);
    expect(sessionsListContract.output.safeParse({ items: [{ ...item, userAgent: 'x' }] }).success).toBe(false);
  });
});

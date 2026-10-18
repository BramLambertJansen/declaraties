import { expect, test } from 'vitest';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from './cursor.ts';

const key = z.tuple([z.literal('naam-az'), z.string(), z.string()]);

test.each(['\xff', '\xc3', '\xc0\xaf'])('ongeldige UTF-8 in een cursor wordt geweigerd: %j', (bytes) => {
  const cursor = btoa(`["naam-az","${bytes}","id-1"]`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

  expect(() => decodeCursor(cursor, key)).toThrow(z.ZodError);
});

test.each(['ü-é-漢', '\ufffd'])('geldige UTF-8 blijft ongewijzigd: %s', (name) => {
  const value = ['naam-az', name, 'id-1'];

  expect(decodeCursor(encodeCursor(value), key)).toStrictEqual(value);
});

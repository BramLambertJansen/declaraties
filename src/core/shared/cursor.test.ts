import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { decodeCursor, encodeCursor, pageQuery, pageSchema } from './cursor.ts';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './limits.ts';

const key = z.object({ createdAt: z.string(), id: z.string() }).strict();

describe('cursor-contract (framework §5)', () => {
  test('een cursor gaat heen en terug, ook met niet-ASCII', () => {
    const value = { createdAt: '2026-10-09T12:00:00.000Z', id: 'ü-é-漢' };

    expect(decodeCursor(encodeCursor(value), key)).toStrictEqual(value);
    expect(encodeCursor(value)).toMatch(/^[\w-]+$/);
  });

  test.each(['niet-base64!', encodeCursor({ id: 1 }), encodeCursor('tekst')])(
    'een gemanipuleerde cursor geeft een ZodError: %s',
    (cursor) => {
      expect(() => decodeCursor(cursor, key)).toThrow(z.ZodError);
    },
  );

  test('limit: standaard en harde grens', () => {
    expect(pageQuery.parse({}).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(() => pageQuery.parse({ limit: MAX_PAGE_SIZE + 1 })).toThrow(z.ZodError);
    expect(() => pageQuery.parse({ onbekend: 1 })).toThrow(z.ZodError);
  });

  test('een pagina heeft precies items en nextCursor', () => {
    const page = pageSchema(z.string());

    expect(page.parse({ items: ['a'], nextCursor: null })).toStrictEqual({ items: ['a'], nextCursor: null });
    expect(() => page.parse({ items: [], nextCursor: null, extra: 1 })).toThrow(z.ZodError);
  });
});

// Spec lijstpagina: de cursor is aan de sortering gebonden, `encodeCursor([sort, ...sleutel])` met een tuple per sortering.
describe('cursor per sortering (spec lijstpagina)', () => {
  const byDate = z.tuple([z.literal('nieuwste'), z.string(), z.string()]);
  const byName = z.tuple([z.literal('naam-az'), z.string(), z.string()]);

  test('een cursor gaat heen en terug met zijn eigen sortering', () => {
    const cursor = encodeCursor(['naam-az', 'ada', 'id-1']);

    expect(decodeCursor(cursor, byName)).toStrictEqual(['naam-az', 'ada', 'id-1']);
  });

  test('een cursor van een andere sortering geeft een ZodError (AC-7)', () => {
    const cursor = encodeCursor(['nieuwste', '2026-10-09T12:00:00.000Z', 'id-1']);

    expect(() => decodeCursor(cursor, byName)).toThrow(z.ZodError);
    expect(decodeCursor(cursor, byDate)[0]).toBe('nieuwste');
  });

  test('een cursor met een verkeerd sleuteltype geeft een ZodError', () => {
    expect(() => decodeCursor(encodeCursor(['naam-az', 42, 'id-1']), byName)).toThrow(z.ZodError);
    expect(() => decodeCursor(encodeCursor(['naam-az', 'ada']), byName)).toThrow(z.ZodError);
    expect(() => decodeCursor(encodeCursor(['naam-az', 'ada', 'id-1', 'extra']), byName)).toThrow(z.ZodError);
  });

  test('een cursor zonder sortering (oud formaat) wordt geweigerd', () => {
    expect(() => decodeCursor(encodeCursor({ createdAt: 'x', id: 'y' }), byName)).toThrow(z.ZodError);
  });
});

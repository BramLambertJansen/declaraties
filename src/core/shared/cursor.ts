import { z } from 'zod';
import { assert } from './assert.ts';
import { DEFAULT_PAGE_SIZE, MAX_CURSOR_LENGTH, MAX_PAGE_SIZE } from './limits.ts';

// Cursor-contract (framework §5): `{ items, nextCursor }`; de cursor staat alleen in de query van TanStack Query ("Meer laden"),
// niet in de URL (spec lijstpagina, OV-1): zoeken, filters en sortering staan er wel in. De cursor is base64url-JSON van de sorteersleutel;
// de server valideert hem met het schema van de route, dus een gemanipuleerde cursor geeft VALIDATION, geen SQL.
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}

export const pageQuery = z
  .object({
    cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

// base64url zonder Buffer: shared code draait ook in de browser. De assert (spec lijstpagina, AC-11) houdt een cursor tegen die
// de invoer zou weigeren: liever een zichtbare INTERNAL_ERROR dan een "Meer laden" dat stil vastloopt (leerpunt #411).
export function encodeCursor(key: unknown): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(JSON.stringify(key))) binary += String.fromCharCode(byte);
  const cursor = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  assert(
    cursor.length <= MAX_CURSOR_LENGTH,
    `cursor van ${String(cursor.length)} tekens is langer dan MAX_CURSOR_LENGTH`,
  );
  return cursor;
}

// Langste cursor voor een tuple strings met deze maximale UTF-16-lengtes (spec lijstpagina, AC-12). JSON maakt van één eenheid
// hooguit 6 bytes (`\u0001`, losse surrogaat; een ander teken hooguit 3 UTF-8-bytes), plus aanhalingstekens, komma's en haken;
// base64url zonder padding maakt van n bytes ceil(4n/3) tekens. Een lijst toetst hiermee dat zijn sleutel in MAX_CURSOR_LENGTH past.
export function maxCursorLength(maxLengths: readonly number[]): number {
  const separators = Math.max(maxLengths.length - 1, 0);
  const bytes = 2 + separators + maxLengths.reduce((sum, length) => sum + 2 + 6 * length, 0);
  return Math.ceil((bytes * 4) / 3);
}

function decodeBase64Url(value: string): string {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function decodeCursor<Key extends z.ZodType>(cursor: string, key: Key): z.infer<Key> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(cursor));
  } catch {
    throw new z.ZodError([{ code: 'custom', path: ['cursor'], message: 'ongeldige cursor', input: cursor }]);
  }
  return key.parse(parsed);
}

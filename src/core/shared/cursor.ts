import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './limits.ts';

// Cursor-contract (framework §5): `{ items, nextCursor }`; de cursor staat alleen in de query van TanStack Query ("Meer laden"),
// niet in de URL (spec lijstpagina, OV-1): zoeken, filters en sortering staan er wel in. De cursor is base64url-JSON van de sorteersleutel;
// de server valideert hem met het schema van de route, dus een gemanipuleerde cursor geeft VALIDATION, geen SQL.
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}

export const pageQuery = z
  .object({
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  })
  .strict();

// base64url zonder Buffer: shared code draait ook in de browser.
export function encodeCursor(key: unknown): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(JSON.stringify(key))) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
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

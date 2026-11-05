import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../../src/api/app.ts';
import { createServices } from '../../src/api/services.ts';
import { accountsListContract } from '../../src/shared/contracts/accounts.ts';
import { beginTestDb, createPool, type TestDb, type TestUser } from '../../src/core/api/db/testing.ts';
import { APP_ORIGIN, createTestApp, required } from '../auth/harness.ts';

// lijstpagina/AC-3 (spec lijstpagina): sortering "Naam A-Z" en meer dan 25 accounts; "Meer laden" is de volgende cursorpagina
// en de rijen volgen de sortering zonder dubbele of ontbrekende rijen. Tegen de echte database, zoals accounts.int.test.ts.
const { auth, pool: apiPool } = createTestApp();
const services = createServices(auth);
const pool = createPool(required('MIGRATOR_DATABASE_URL'));
afterAll(async () => {
  await Promise.all([pool.end(), apiPool.end()]);
});

let db: TestDb;
beforeEach(async () => {
  db = await beginTestDb(pool);
});
afterEach(async () => {
  await db.rollback();
});

async function list(user: TestUser, query: string) {
  const app = buildApp({ appOrigin: APP_ORIGIN, auth: user.auth, withUser: db.withUser, services });
  const response = await app.fetch(new Request(`${APP_ORIGIN}/api/accounts?${query}`));
  expect(response.status).toBe(200);
  return accountsListContract.output.parse(await response.json());
}

describe('lijstpagina/AC-3 (API-deel): Naam A-Z met meer dan 25 accounts, cursorpagina voor cursorpagina', () => {
  test("de pagina's volgen de sortering zonder dubbele of ontbrekende rijen", async () => {
    const admin = await db.asUser('admin', { name: 'Test Admin' });
    // Invoegvolgorde bewust niet alfabetisch: de volgorde komt van de sortering, niet van de aanmaaktijd.
    const names = Array.from({ length: 30 }, (_, i) => `Sorteer ${String((i * 7) % 30).padStart(2, '0')}`);
    const mine = new Map<string, string>();
    for (const name of names) mine.set((await db.asUser('user', { name })).actor.userId, name);

    const seen: { id: string; naam: string }[] = [];
    let pages = 0;
    let cursor: string | null = null;
    do {
      const query: string = cursor === null ? 'sort=naam-az' : `sort=naam-az&cursor=${encodeURIComponent(cursor)}`;
      const result = await list(admin, query);
      expect(result.items.length).toBeLessThanOrEqual(25);
      seen.push(...result.items);
      cursor = result.nextCursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBeGreaterThan(1);
    expect(new Set(seen.map((item) => item.id)).size).toBe(seen.length);
    const own = seen.filter((item) => mine.has(item.id)).map((item) => item.naam);
    expect(own).toStrictEqual([...names].sort());
    const keys = seen.map((item) => item.naam.toLowerCase()).filter((key) => key.startsWith('sorteer '));
    expect(keys).toStrictEqual([...keys].sort());
  });
});

import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import { encodeCursor } from '../../src/core/shared/cursor.ts';
import { accountsListContract } from '../../src/shared/contracts/accounts.ts';
import { createAccountTestApp } from './account-harness.ts';

const t = createAccountTestApp();
afterAll(() => t.close());

test('datumcursors met ongeldige datumwaarden geven 400, geen databasefout', async () => {
  const admin = await t.account('admin');
  await t.enableTotp(admin.browser);
  for (const sort of ['nieuwste', 'oudste']) {
    for (const date of ['not-a-timestamp', '2026-02-30T12:00:00Z', '']) {
      const cursor = encodeCursor([sort, date, 'id']);
      const response = await t.call(admin.browser, `GET /api/accounts?sort=${sort}&cursor=${cursor}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'VALIDATION' });
    }
  }
});

test.each(['nieuwste', 'oudste'])('paginering met %s bewaart microseconden zonder rijen te verliezen', async (sort) => {
  const admin = await t.account('admin');
  await t.enableTotp(admin.browser);
  const prefix = `micro-${randomUUID()}`;
  await t.migrator.query(
    `with inserted as (
    insert into better_auth."user" (id, name, email, "emailVerified", "createdAt")
    select $1 || '-' || n, $1 || n, $1 || n || '@template.test', true,
      '2026-01-01T12:00:00Z'::timestamptz + n * interval '1 microsecond'
    from generate_series(1, 26) as n returning id
  ) select app.assign_role(id, 'user') from inserted`,
    [prefix],
  );
  const firstResponse = await t.call(admin.browser, `GET /api/accounts?q=${prefix}&sort=${sort}`);
  expect(firstResponse.status).toBe(200);
  const first = accountsListContract.output.parse(await firstResponse.json());
  expect(first.items).toHaveLength(25);
  expect(first.nextCursor).not.toBeNull();
  const secondResponse = await t.call(
    admin.browser,
    `GET /api/accounts?q=${prefix}&sort=${sort}&cursor=${first.nextCursor ?? ''}`,
  );
  expect(secondResponse.status).toBe(200);
  const second = accountsListContract.output.parse(await secondResponse.json());
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(26);
});

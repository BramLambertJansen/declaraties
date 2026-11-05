import { expect, test, vi } from 'vitest';
import { AppError } from '#core/api/errors.ts';
import { encodeCursor } from '#core/shared/cursor.ts';
import { unsafeCast } from '#core/shared/unsafe-cast.ts';
import { accountsListRoute } from './accounts.ts';

test.each(['nieuwste', 'oudste'] as const)('ongeldige datumcursor bij %s faalt vóór een query', async (sort) => {
  const select = vi.fn();
  const context = unsafeCast<Parameters<typeof accountsListRoute.handler>[0]>(
    {
      input: { sort, cursor: encodeCursor([sort, 'not-a-timestamp', 'id']) },
      tx: { select },
    },
    'test: de ongeldige cursor moet vóór database- of actor-gebruik worden geweigerd',
  );
  await expect(accountsListRoute.handler(context)).rejects.toEqual(new AppError('VALIDATION'));
  expect(select).not.toHaveBeenCalled();
});

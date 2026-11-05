import { afterAll, expect, test } from 'vitest';
import { createAccountTestApp } from '../api/account-harness.ts';

const setup = createAccountTestApp();
afterAll(async () => {
  await setup.close();
});

test('account-lifecycle/AC-1/2: optionele MFA-inschrijving in een bestaande login verandert de loginhistorie niet', async () => {
  const user = await setup.account('user', 'Optionele MFA');
  const historical = new Date('2000-01-01T00:00:00.000Z');
  await setup.authDb.query('update "user" set last_login_at = $2 where id = $1', [user.userId, historical]);
  await setup.enableTotp(user.browser);
  const result = await setup.authDb.query<{ last_login_at: Date }>('select last_login_at from "user" where id = $1', [
    user.userId,
  ]);
  expect(result.rows[0]?.last_login_at).toEqual(historical);
  expect((await user.browser.get('/api/me')).status).toBe(200);
});

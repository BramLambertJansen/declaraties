import { afterAll, beforeAll, expect, test } from 'vitest';
import { buildApp } from '../../src/api/app.ts';
import { createServices } from '../../src/api/services.ts';
import { authGateway } from '../../src/core/api/auth/index.ts';
import { createDevLogin, devAuthSteps } from '../../src/core/api/dev/login-as.ts';
import { ensureAccount } from '../../src/core/api/dev/ensure-account.ts';
import { SEED_ACCOUNTS, SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from '../../src/core/api/dev/seed-accounts.ts';
import { APP_ORIGIN, Browser, createTestApp } from './harness.ts';

// Dev-rolwisselaar (ADR 0043) tegen de echte Better Auth: snel wisselen vanaf één IP loopt niet tegen de rate limit van
// het inloggen aan (dat gaf lokaal een 500 na drie wissels), en de admin krijgt een MFA-sessie.
const { auth, pool, withUser } = createTestApp();
const gateway = authGateway(auth);
const app = buildApp({
  appOrigin: APP_ORIGIN,
  auth: gateway,
  withUser,
  services: createServices(auth),
  devLogin: createDevLogin(devAuthSteps(auth)),
});

beforeAll(async () => {
  for (const [role, account] of Object.entries(SEED_ACCOUNTS)) {
    await ensureAccount(auth, {
      email: account.email,
      name: account.name,
      password: SEED_DEMO_WACHTWOORD,
      ...(role === 'admin' ? { totpSecret: SEED_ADMIN_TOTP_SLEUTEL } : {}),
    });
  }
});
afterAll(async () => {
  await pool.end();
});

test('tien wissels achter elkaar vanaf één IP: elke keer 204 en een sessie met de juiste sterkte', async () => {
  const browser = new Browser(app);
  const seen: string[] = [];

  for (let i = 0; i < 10; i += 1) {
    const role = i % 2 === 0 ? 'admin' : 'user';
    const response = await browser.post('/api/dev/login-as', { rol: role });
    const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const { session } = await gateway.getSession(new Headers({ cookie }));
    seen.push(`${String(response.status)} ${session?.email ?? '-'} ${session?.sessionStrength ?? '-'}`);
  }

  expect(seen).toStrictEqual(
    Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? `204 ${SEED_ACCOUNTS.admin.email} mfa` : `204 ${SEED_ACCOUNTS.user.email} password`,
    ),
  );
});

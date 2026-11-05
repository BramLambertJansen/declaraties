import { describe, expect, test } from 'vitest';
import { createDevLogin, type DevAuthSteps } from './login-as.ts';
import { SEED_ADMIN_TOTP_SLEUTEL, SEED_DEMO_WACHTWOORD } from './seed-accounts.ts';
import { totpCode } from './totp.ts';

// De stappen van Better Auth nagebootst, om de volgorde, de cookies en de TOTP-code te zien. Tegen de echte Better Auth
// (ook: geen rate limit bij snel wisselen): test/auth/dev-login.int.test.ts.
function fakeSteps(fail = false) {
  const calls: { step: string; body: unknown; cookie: string | null }[] = [];
  const steps: DevAuthSteps = {
    signIn: (email, password, headers) => {
      calls.push({ step: 'signIn', body: { email, password }, cookie: headers.get('cookie') });
      if (fail) return Promise.reject(new Error('dev-login: /sign-in/email mislukte (draait de seed?)'));
      return Promise.resolve(['__Host-auth.two_factor=tf1; Path=/; Secure; HttpOnly']);
    },
    verifyTotp: (code, headers) => {
      calls.push({ step: 'verifyTotp', body: { code }, cookie: headers.get('cookie') });
      return Promise.resolve(['__Host-auth.session_token=s1; Path=/; Secure; HttpOnly']);
    },
  };
  return { steps, calls };
}

describe('createDevLogin', () => {
  test('user: inloggen met het seed-account en het demo-wachtwoord, zonder de oude cookies; de cookies gaan naar de browser', async () => {
    const { steps, calls } = fakeSteps();
    const cookies = await createDevLogin(steps)('user', new Headers({ cookie: 'oud=1' }));

    expect(calls).toStrictEqual([
      {
        step: 'signIn',
        body: { email: 'gebruiker@template.test', password: SEED_DEMO_WACHTWOORD },
        cookie: null,
      },
    ]);
    expect(cookies).toStrictEqual(['__Host-auth.two_factor=tf1; Path=/; Secure; HttpOnly']);
  });

  test('admin: daarna de TOTP-stap met de code uit het vaste lokale geheim en het cookie van stap één', async () => {
    const { steps, calls } = fakeSteps();
    const cookies = await createDevLogin(steps)('admin', new Headers());

    expect(calls.map((call) => call.step)).toStrictEqual(['signIn', 'verifyTotp']);
    expect(calls[1]?.cookie).toBe('__Host-auth.two_factor=tf1');
    expect(calls[1]?.body).toStrictEqual({ code: totpCode(SEED_ADMIN_TOTP_SLEUTEL) });
    expect(cookies).toHaveLength(2);
  });

  test('een geweigerde stap faalt hard (bijv. zonder seed)', async () => {
    const { steps } = fakeSteps(true);

    await expect(createDevLogin(steps)('user', new Headers())).rejects.toThrow('draait de seed?');
  });
});

describe('totpCode', () => {
  test('RFC 6238-testvector (SHA-1): T=59 s geeft 287082', () => {
    expect(totpCode('12345678901234567890', 59_000)).toBe('287082');
  });
});

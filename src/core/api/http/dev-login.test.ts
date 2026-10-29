import { describe, expect, test } from 'vitest';
import { createApp, type DevLogin } from './create-app.ts';
import { parseErrorBody } from './error-body.test-helper.ts';
import { request } from './request.test-helper.ts';

// POST /api/dev/login-as (ADR 0043): bestaat alleen als server.ts een devLogin meegeeft (APP_ENV=local).
const ORIGIN = 'http://localhost:5173';
const calls: string[] = [];
const devLogin: DevLogin = (role) => {
  calls.push(role);
  return Promise.resolve([`__Host-auth.session_token=${role}; Path=/; Secure; HttpOnly`]);
};

function post(body: string, site = 'same-origin') {
  return { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': site }, body };
}

describe('/api/dev/login-as', () => {
  test('zonder devLogin (buiten local): 404', async () => {
    const response = await request(createApp({ appOrigin: ORIGIN }), '/api/dev/login-as', post('{"rol":"user"}'));

    expect(response.status).toBe(404);
  });

  test('met devLogin: 204 en de sessiecookie van de rol', async () => {
    const app = createApp({ appOrigin: ORIGIN, devLogin });
    const response = await request(app, '/api/dev/login-as', post('{"rol":"admin"}'));

    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toStrictEqual([
      '__Host-auth.session_token=admin; Path=/; Secure; HttpOnly',
    ]);
    expect(calls.at(-1)).toBe('admin');
  });

  test('een onbekende rol of een extra veld: 400 VALIDATION', async () => {
    const app = createApp({ appOrigin: ORIGIN, devLogin });

    for (const body of ['{"rol":"baas"}', '{"rol":"user","x":1}', 'kapot']) {
      const response = await request(app, '/api/dev/login-as', post(body));
      expect([response.status, parseErrorBody(await response.json()).code]).toStrictEqual([400, 'VALIDATION']);
    }
  });

  test('cross-site: geweigerd door de CSRF-controle, zoals elke POST', async () => {
    const response = await request(
      createApp({ appOrigin: ORIGIN, devLogin }),
      '/api/dev/login-as',
      post('{"rol":"user"}', 'cross-site'),
    );

    expect(response.status).toBe(403);
  });
});

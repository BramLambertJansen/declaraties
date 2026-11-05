import { describe, expect, test } from 'vitest';
import { createApp } from './create-app.ts';
import { parseErrorBody } from './error-body.test-helper.ts';

// Testmatrix uit ADR 0041, rij voor rij, door de echte app heen. Er is geen POST-route: een toegestaan request
// komt voorbij de CSRF-controle en krijgt 404, een geweigerd request krijgt 403 met CSRF_REJECTED.
const APP_ORIGIN = 'http://localhost:5173';
const app = createApp({ appOrigin: APP_ORIGIN });

type HeaderValue = string | readonly string[] | undefined;

interface Row {
  nr: number;
  site: HeaderValue;
  origin: HeaderValue;
  type: HeaderValue;
  method?: string;
  allowed: boolean;
}

function request({ site, origin, type, method = 'POST' }: Row): Request {
  const headers = new Headers();
  const add = (name: string, value: HeaderValue) => {
    for (const item of typeof value === 'string' ? [value] : (value ?? [])) headers.append(name, item);
  };
  add('sec-fetch-site', site);
  add('origin', origin);
  add('content-type', type);
  return new Request('http://localhost/api/x', { method, headers });
}

const json = 'application/json';
const rows: Row[] = [
  { nr: 1, site: 'same-origin', origin: undefined, type: json, allowed: true },
  { nr: 2, site: undefined, origin: APP_ORIGIN, type: json, allowed: true },
  { nr: 3, site: 'same-origin', origin: APP_ORIGIN, type: json, allowed: true },
  { nr: 4, site: 'same-origin', origin: undefined, type: 'application/json; charset=utf-8', allowed: true },
  { nr: 5, site: undefined, origin: undefined, type: json, allowed: false },
  { nr: 6, site: 'same-site', origin: APP_ORIGIN, type: json, allowed: false },
  { nr: 7, site: 'cross-site', origin: undefined, type: json, allowed: false },
  { nr: 8, site: 'none', origin: undefined, type: json, allowed: false },
  { nr: 9, site: 'same-origin', origin: 'http://evil.test', type: json, allowed: false },
  { nr: 10, site: undefined, origin: 'null', type: json, allowed: false },
  { nr: 11, site: 'same-origin', origin: undefined, type: 'text/plain', allowed: false },
  { nr: 11, site: 'same-origin', origin: undefined, type: 'multipart/form-data; boundary=x', allowed: false },
  { nr: 11, site: 'same-origin', origin: undefined, type: 'application/x-www-form-urlencoded', allowed: false },
  { nr: 12, site: 'same-origin', origin: undefined, type: 'application/jsonx', allowed: false },
  { nr: 13, site: 'same-origin', origin: undefined, type: undefined, method: 'DELETE', allowed: false },
  { nr: 13, site: 'same-origin', origin: undefined, type: undefined, allowed: false },
  { nr: 14, site: 'same-origin', origin: undefined, type: 'Application/JSON', allowed: true },
  { nr: 15, site: 'same-origin', origin: [APP_ORIGIN, APP_ORIGIN], type: json, allowed: false },
  { nr: 15, site: 'same-origin', origin: `${APP_ORIGIN}, ${APP_ORIGIN}`, type: json, allowed: false },
  { nr: 16, site: 'cross-site', origin: 'http://evil.test', type: 'text/plain', method: 'GET', allowed: true },
  { nr: 16, site: undefined, origin: undefined, type: undefined, method: 'HEAD', allowed: true },
  { nr: 16, site: 'cross-site', origin: 'null', type: undefined, method: 'OPTIONS', allowed: true },
  { nr: 17, site: 'same-origin', origin: undefined, type: [json, json], allowed: false },
  { nr: 18, site: 'same-origin', origin: undefined, type: json, method: 'PUT', allowed: true },
  { nr: 18, site: 'same-origin', origin: undefined, type: json, method: 'PATCH', allowed: true },
  { nr: 18, site: 'same-origin', origin: undefined, type: json, method: 'DELETE', allowed: true },
  // Extra: dubbele Sec-Fetch-Site en een Origin met slash achteraan.
  { nr: 0, site: ['same-origin', 'same-origin'], origin: undefined, type: json, allowed: false },
  { nr: 0, site: undefined, origin: `${APP_ORIGIN}/`, type: json, allowed: false },
];

describe('CSRF-middleware (ADR 0041)', () => {
  test.each(rows)('rij $nr: $method site=$site origin=$origin type=$type → toegestaan: $allowed', async (row) => {
    const response = await app.fetch(request(row));

    if (row.allowed) {
      expect(response.status).not.toBe(403);
    } else {
      expect(response.status).toBe(403);
      expect(parseErrorBody(await response.json()).code).toBe('CSRF_REJECTED');
    }
  });

  test('zonder appOrigin weigert de app elke Origin-header (veilige standaard)', async () => {
    const response = await createApp().fetch(
      request({ nr: 2, site: undefined, origin: APP_ORIGIN, type: json, allowed: false }),
    );

    expect(response.status).toBe(403);
  });
});

import { describe, expect, test } from 'vitest';
import { createApp } from './create-app.ts';
import { request } from './request.test-helper.ts';

test('GET /api/health geeft alleen { ok: true }', async () => {
  const response = await request(createApp(), '/api/health');

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ ok: true });
});

test('onbekende route geeft 404', async () => {
  const response = await request(createApp(), '/api/onbekend');

  expect(response.status).toBe(404);
});

describe('GET /api/ready (readiness, framework §3)', () => {
  test('database bereikbaar: 200 met alleen { ok: true }', async () => {
    const response = await request(createApp({ ready: () => Promise.resolve(true) }), '/api/ready');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('database onbereikbaar: 503 met alleen { ok: false }', async () => {
    const response = await request(createApp({ ready: () => Promise.resolve(false) }), '/api/ready');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  test('zonder ready bestaat de route niet', async () => {
    const response = await request(createApp(), '/api/ready');
    expect(response.status).toBe(404);
  });
});

describe('requestId (ADR 0051)', () => {
  test('de server maakt hem zelf: een X-Request-Id van de client wordt genegeerd', async () => {
    const response = await request(createApp(), '/api/bestaat-niet', {
      headers: { 'X-Request-Id': 'door-de-client-gekozen' },
    });
    const body: unknown = await response.json();
    const id = response.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body).toEqual({ code: 'NOT_FOUND', requestId: id });
  });
});

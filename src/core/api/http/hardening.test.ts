import { describe, expect, test, vi } from 'vitest';
import { MAX_BODY_BYTES } from '../../shared/limits.ts';
import { appWith, defineRoute, notesContract } from '../route/fixture.test-helper.ts';
import { createApp } from './create-app.ts';
import { request } from './request.test-helper.ts';
import { parseErrorBody } from './error-body.test-helper.ts';

// Framework §6: naar buiten alleen `{ code, requestId }`, nooit een stacktrace; bodyLimit; secureHeaders voor /api.
const json = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };

describe('createApp: verharding', () => {
  test('een fout in een route geeft 500 met alleen code en requestId', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = defineRoute(notesContract, () => {
      throw new Error('geheime details met SQL');
    });
    const { app } = appWith({ role: 'user', sessionStrength: 'password' }, [boom]);

    const response = await request(app, '/api/notes/n1');
    const body: unknown = await response.json();

    expect(response.status).toBe(500);
    expect(parseErrorBody(body).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('geheim');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  test('een fout met een e-mailadres in message en detail lekt niet naar de log, de requestId wel', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const boom = defineRoute(notesContract, () => {
        throw Object.assign(new Error('duplicate key value (alice@example.com)'), {
          code: '23505',
          detail: 'Key (email)=(alice@example.com) already exists.',
        });
      });
      const { app } = appWith({ role: 'user', sessionStrength: 'password' }, [boom]);

      const response = await request(app, '/api/notes/n1');
      const body = parseErrorBody(await response.json());

      expect(response.status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(error).toHaveBeenCalledOnce();
      const logged = JSON.stringify(error.mock.calls);
      expect(logged).toContain(body.requestId);
      expect(logged).toContain('/api/notes/:id');
      expect(logged).not.toContain('/notes/n1');
      expect(logged).not.toContain('alice');
      expect(logged).not.toContain('example.com');
      expect(logged).not.toContain('detail');
      expect(logged).not.toContain('already exists');
      expect(logged).not.toContain('"stack"');
    } finally {
      error.mockRestore();
    }
  });

  test('onbekende route geeft NOT_FOUND met requestId', async () => {
    const response = await request(createApp(), '/api/onbekend');

    expect(parseErrorBody(await response.json()).code).toBe('NOT_FOUND');
  });

  test('een te grote body geeft 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(createApp(), '/api/x', {
      method: 'POST',
      headers: json,
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  test('elke response heeft secureHeaders en een X-Request-Id', async () => {
    const response = await request(createApp(), '/api/health');

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('x-request-id')).toMatch(/.+/);
  });
});

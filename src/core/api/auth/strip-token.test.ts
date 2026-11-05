import { describe, expect, test } from 'vitest';
import { stripTokens } from './strip-token.ts';

// Geen `token` in een JSON-antwoord van /api/auth/* (ADR 0075, spec inloggat-dichten AC-9). De echte endpoints:
// test/auth/eenmalig.int.test.ts (AC-8).
function json(body: unknown, headers: Record<string, string> = {}): Response {
  const text = JSON.stringify(body);
  const response = new Response(text, {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)), ...headers },
  });
  response.headers.append('set-cookie', '__Host-auth.session_token=abc; Path=/; Secure; HttpOnly');
  response.headers.append('set-cookie', '__Host-auth.session_data=def; Path=/; Secure; HttpOnly');
  return response;
}

describe('stripTokens', () => {
  test('token weg op het hoogste niveau, in een genest object en in een array; de rest blijft', async () => {
    const response = await stripTokens(
      json({
        token: 't1',
        user: { id: 'u', token: 't2' },
        session: { token: 't3', id: 's' },
        list: [{ token: 't4', a: 1 }],
      }),
    );

    expect(await response.json()).toStrictEqual({ user: { id: 'u' }, session: { id: 's' }, list: [{ a: 1 }] });
  });

  test('status, Set-Cookie en content-type blijven gelijk; Content-Length klopt met de nieuwe body', async () => {
    const response = await stripTokens(json({ token: 't', user: { id: 'u' } }));
    const text = await response.clone().text();

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toStrictEqual([
      '__Host-auth.session_token=abc; Path=/; Secure; HttpOnly',
      '__Host-auth.session_data=def; Path=/; Secure; HttpOnly',
    ]);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('content-length')).toBe(String(Buffer.byteLength(text)));
  });

  test('ook bij een foutstatus en bij application/problem+json', async () => {
    const response = await stripTokens(
      new Response(JSON.stringify({ token: 't', code: 'X' }), {
        status: 401,
        headers: { 'content-type': 'application/problem+json; charset=utf-8' },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toStrictEqual({ code: 'X' });
  });

  test('null en JSON zonder token blijven gelijk', async () => {
    expect(await (await stripTokens(json(null))).json()).toBeNull();
    expect(await (await stripTokens(json({ status: true }))).json()).toStrictEqual({ status: true });
  });

  test('geen JSON: dezelfde response, byte voor byte', async () => {
    const original = new Response('Not Found token', { status: 404, headers: { 'content-type': 'text/plain' } });

    const response = await stripTokens(original);

    expect(response).toBe(original);
    expect(await response.text()).toBe('Not Found token');
  });

  test('ongeldige JSON met een JSON-type: ongewijzigde tekst en status', async () => {
    const response = await stripTokens(
      new Response('{kapot', { status: 500, headers: { 'content-type': 'application/json' } }),
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{kapot');
  });
});

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import type { App } from './create-app.ts';
import { request } from './request.test-helper.ts';
import { contentSecurityPolicy } from './security-headers.ts';
import { createWebApp } from './web.ts';

// Productieserver voor één origin (ADR 0049): /api naar de API, de rest uit de build met de headers van de SPA.

const dir = mkdtempSync(path.join(tmpdir(), 'web-'));
mkdirSync(path.join(dir, 'assets'));
writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *');
writeFileSync(path.join(dir, '.env'), 'GEHEIM=1');
mkdirSync(path.join(dir, '.well-known'));
writeFileSync(path.join(dir, '.well-known', 'security.txt'), 'Contact: mailto:security@example.test');
const outside = mkdtempSync(path.join(tmpdir(), 'buiten-'));
writeFileSync(path.join(outside, 'geheim.txt'), 'buiten de build');
symlinkSync(path.join(outside, 'geheim.txt'), path.join(dir, 'link.txt'));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

// De echte API zet zelf secureHeaders(); de nep-API zet een eigen CSP, zodat te zien is dat createWebApp hem niet overschrijft.
const API_CSP = "default-src 'none'";
const api: App = {
  fetch: (incoming) =>
    Promise.resolve(
      Response.json(
        { api: new URL(incoming.url).pathname, method: incoming.method },
        { headers: { 'Content-Security-Policy': API_CSP } },
      ),
    ),
};
const web = createWebApp(api, dir);

describe('createWebApp', () => {
  test('/api en /api/* gaan ongewijzigd naar de API', async () => {
    const response = await request(web, '/api/auth/sign-in', { method: 'POST' });
    expect(await response.json()).toEqual({ api: '/api/auth/sign-in', method: 'POST' });
    expect(await (await request(web, '/api')).json()).toEqual({ api: '/api', method: 'GET' });
  });

  test('/ geeft index.html met de CSP van de SPA en zonder cache', async () => {
    const response = await request(web, '/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>app</title>');
    expect(response.headers.get('content-security-policy')).toBe(contentSecurityPolicy());
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  test('een schermroute zonder bestand geeft index.html', async () => {
    const response = await request(web, '/admin/accounts');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>app</title>');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  test('een asset met hash mag onbeperkt in de cache en heeft de headers', async () => {
    const response = await request(web, '/assets/index-abc123.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('content-security-policy')).toBe(contentSecurityPolicy());
  });

  test('een ander bestand uit de build wordt geserveerd, zonder onbeperkte cache', async () => {
    const response = await request(web, '/robots.txt');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  test('een ontbrekend bestand is 404, geen index.html', async () => {
    expect((await request(web, '/assets/oud-999.js')).status).toBe(404);
    expect((await request(web, '/oud.js')).status).toBe(404);
  });

  test('buiten de build komt niets: pad met .. of procent-codering', async () => {
    for (const probe of ['/../package.json', '/assets/../../package.json', '/%2e%2e/package.json']) {
      const response = await request(web, probe);
      expect(await response.text()).not.toContain('"name"');
    }
  });

  test('POST buiten /api is 404', async () => {
    expect((await request(web, '/', { method: 'POST' })).status).toBe(404);
  });

  test('zonder index.html weigert hij te starten', () => {
    expect(() => createWebApp(api, path.join(dir, 'assets'))).toThrow(/index.html ontbreekt/);
  });

  test('API-responses houden hun eigen headers: geen SPA-CSP en geen cache-control', async () => {
    const response = await request(web, '/api/health');
    expect(response.headers.get('content-security-policy')).toBe(API_CSP);
    expect(response.headers.get('cache-control')).toBeNull();
  });

  test('/apix is geen API-route maar een schermroute', async () => {
    const response = await request(web, '/apix');
    expect(await response.text()).toContain('<title>app</title>');
  });

  test('HEAD op een schermroute en een asset', async () => {
    expect((await request(web, '/admin', { method: 'HEAD' })).status).toBe(200);
    expect((await request(web, '/assets/index-abc123.js', { method: 'HEAD' })).status).toBe(200);
  });

  test('geen verborgen bestanden, wel /.well-known/', async () => {
    expect((await request(web, '/.env')).status).toBe(404);
    const response = await request(web, '/.well-known/security.txt');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Contact:');
  });

  test('een symlink naar buiten de build wordt niet gevolgd', async () => {
    const response = await request(web, '/link.txt');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('buiten de build');
  });
});

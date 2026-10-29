import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createWebApp } from './web.ts';

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'web-directory-index-'));
  roots.push(dir);
  const root = path.join(dir, 'build');
  mkdirSync(root);
  writeFileSync(path.join(root, 'index.html'), '<title>App</title>');
  const outside = path.join(dir, 'outside.html');
  writeFileSync(outside, 'buiten-de-build-fixture');
  return { root, outside };
}

const api = { fetch: () => Promise.resolve(new Response(null, { status: 404 })) };

test.each([
  ['GET', '/docs'],
  ['GET', '/docs/'],
  ['HEAD', '/docs'],
  ['HEAD', '/docs/'],
])('een directory-index via een symlink buiten de build blijft geblokkeerd: %s %s', async (method, url) => {
  const { root, outside } = fixture();
  mkdirSync(path.join(root, 'docs'));
  symlinkSync(outside, path.join(root, 'docs', 'index.html'));
  const web = createWebApp(api, root);

  const response = await web.fetch(new Request(`http://localhost${url}`, { method }));
  const text = await response.text();
  expect(response.status).toBe(404);
  expect(text).not.toContain('buiten-de-build-fixture');
});

test('een hoofdindex via een symlink buiten de build wordt bij opstart geweigerd', () => {
  const { root, outside } = fixture();
  rmSync(path.join(root, 'index.html'));
  symlinkSync(outside, path.join(root, 'index.html'));

  expect(() => createWebApp(api, root)).toThrow(/index.html.*buiten/);
});

test('een directory-index via een symlink binnen de build blijft beschikbaar', async () => {
  const { root } = fixture();
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'page.html'), '<title>Documentatie</title>');
  symlinkSync(path.join(root, 'page.html'), path.join(root, 'docs', 'index.html'));
  const web = createWebApp(api, root);

  const response = await web.fetch(new Request('http://localhost/docs/'));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<title>Documentatie</title>');
});

test('een hoofdindex via een symlink binnen de build blijft beschikbaar voor de SPA', async () => {
  const { root } = fixture();
  writeFileSync(path.join(root, 'page.html'), '<title>App via symlink</title>');
  rmSync(path.join(root, 'index.html'));
  symlinkSync(path.join(root, 'page.html'), path.join(root, 'index.html'));
  const web = createWebApp(api, root);

  const response = await web.fetch(new Request('http://localhost/admin'));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<title>App via symlink</title>');
});

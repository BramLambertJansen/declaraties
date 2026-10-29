import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Statische basis van de SPA (roadmap 3f): standaard niet indexeren, een eigen icoon. createWebApp (ADR 0049) en Vite
// serveren src/web/public op de wortel.
const read = (file: string) => readFileSync(new URL(`../../src/web/${file}`, import.meta.url), 'utf8');

test('index.html zegt noindex, en robots.txt laat crawlers dat zien (geen Disallow)', () => {
  expect(read('public/robots.txt')).toMatch(/^User-agent: \*\nAllow: \/$/m);
  expect(read('public/robots.txt')).not.toMatch(/^Disallow:/m);
  expect(read('index.html')).toContain('<meta name="robots" content="noindex, nofollow" />');
});

test('index.html verwijst naar het icoon, en dat bestaat als SVG', () => {
  expect(read('index.html')).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
  expect(read('public/favicon.svg')).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

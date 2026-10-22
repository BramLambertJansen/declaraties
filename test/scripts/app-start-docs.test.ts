import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const document = readFileSync(new URL('../../docs/nieuwe-app.md', import.meta.url), 'utf8');
const portsSection = document.split('### 7.1 Poorten en `.env.local`')[1]?.split('### 7.2')[0] ?? '';

test('de poortpreflight controleert database, mail, API en web vóór een tweede app start', () => {
  const pattern = /grep -E '([^']+)'/.exec(portsSection)?.[1];
  expect(pattern).toBeDefined();
  const expression = new RegExp(pattern ?? '(?!)');
  for (const port of [54322, 54324, 54325, 8787, 5173]) expect(`127.0.0.1:${String(port)}`).toMatch(expression);
  expect('127.0.0.1:51730').not.toMatch(expression);
});

test('de poortkeuze benoemt ook beide origins en de afzonderlijke API- en webconfiguratie', () => {
  for (const key of ['API_PORT', 'WEB_PORT', 'APP_ORIGIN', 'AUTH_BASE_URL'])
    expect(portsSection).toContain(`\`${key}\``);
});

test('de setup stopt vóór push bij ontbrekende CodeQL en presenteert de rulesetvlag niet als volledige oplossing', () => {
  const pushSection = document.split('### 6.1 Push (overdracht)')[1]?.split('### 6.2')[0] ?? '';
  expect(pushSection).toContain('stop vóór de eerste push');
  expect(pushSection).toContain('`--zonder-codeql` wijzigt alleen de ruleset');
  expect(pushSection).toContain('workflow, ruleset en verificatieregister');
  expect(pushSection).toContain('behandel ontbrekende checks niet als geslaagd');
});

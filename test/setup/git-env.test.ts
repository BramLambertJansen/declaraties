import { execFileSync } from 'node:child_process';
import { expect, test } from 'vitest';

// Draait gate:fast vanuit een git-hook, dan bewijst dit dat test/setup/git-env.ts de repo-variabelen van de hook weghaalde.
test('tijdens de tests staat geen repo-variabele van git in process.env', () => {
  const names = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  expect(names).toContain('GIT_DIR');
  expect(names.filter((name) => process.env[name] !== undefined)).toStrictEqual([]);
});

// In de runner (ADR 0044) bestaat git niet; de setup mag de integratietests dan niet laten falen.
test('zonder git op het PATH slaagt de setup', () => {
  expect(() =>
    execFileSync(process.execPath, ['test/setup/git-env.ts'], { env: { PATH: '' }, stdio: 'pipe' }),
  ).not.toThrow();
});

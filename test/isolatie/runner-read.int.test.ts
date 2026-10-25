import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('de runner kan een voor deze run gemaakt hostbestand niet lezen', () => {
  const canary = process.env['RUNNER_PRIVATE_CANARY'];
  expect(canary).toMatch(/^\/repo\/\.runner-canary\.[A-Za-z0-9]+$/);
  if (canary === undefined) throw new Error('Draai via pnpm test:db');
  expect(() => readFileSync(canary)).toThrow(/ENOENT|EACCES/);
});

test.each(['/repo/.git', '/repo/.env.local', '/repo/.claude/settings.local.json'])(
  'hostmetadata en privéconfiguratie zijn niet gemount: %s',
  (file) => {
    expect(() => readFileSync(file)).toThrow(/ENOENT|EACCES/);
  },
);

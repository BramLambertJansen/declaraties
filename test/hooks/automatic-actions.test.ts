import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decide, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';

function action(command: string, role = '', trusted = true) {
  const root = process.cwd();
  return decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: role },
    {
      root,
      cwd: root,
      branch: 'feat/example',
      config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
      authority: null,
      runnerTrusted: trusted,
      read: () => null,
      committed: () => false,
      isDir: () => false,
    },
  );
}

test.each(['pnpm test:db', 'pnpm ui:check', 'pnpm gate:slow'])(
  'vertrouwde runner %s krijgt expliciet allow',
  (command) => {
    expect(action(command).allow).toBe(true);
    expect(action(command, 'developer').allow).toBe(true);
    expect(action(command, '', false).allow).toBeUndefined();
  },
);

test.each([
  'pnpm test:db --sta-wijzigingen-toe',
  'pnpm ui:check --sta-wijzigingen-toe',
  'CI=true pnpm test:db',
  'export CI=true',
])('runneroverride %s wordt geweigerd', (command) => {
  expect(action(command).deny).not.toHaveLength(0);
  expect(action(command, 'developer').deny).not.toHaveLength(0);
});

test.each(['developer', 'architect', 'tester', 'docs', 'reviewer', 'Explore'])(
  'rol %s zet geen label via helper',
  (role) => {
    expect(action('pnpm pr:label-gate 123', role).deny).not.toHaveLength(0);
    expect(action('node scripts/kit/pr-gate-label.mjs 123', role).deny).not.toHaveLength(0);
  },
);

test('hoofdsessie gebruikt labelhelper; directe zelfgoedkeuring blijft verboden', () => {
  expect(action('pnpm pr:label-gate 123').deny).toHaveLength(0);
  expect(action('gh pr edit 123 --add-label gate-wijziging').deny).not.toHaveLength(0);
  expect(action('gh pr review 123 --approve').deny).not.toHaveLength(0);
});

test('een andere package in een submap krijgt geen automatische hosttoestemming', () => {
  const root = process.cwd();
  const result = decide(
    { tool_name: 'Bash', tool_input: { command: 'pnpm test:db' }, agent_type: 'developer' },
    {
      root,
      cwd: `${root}/src/web`,
      branch: 'feat/example',
      config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
      authority: null,
      runnerTrusted: true,
      read: () => null,
      committed: () => false,
      isDir: () => false,
    },
  );
  expect(result.allow).toBeUndefined();
});

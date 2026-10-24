import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

type Trusted = boolean | (() => boolean);

function run(payload: unknown, trusted: Trusted, options: { cwdSub?: boolean } = {}) {
  const root = process.cwd();
  return decide(payload, {
    root,
    cwd: options.cwdSub ? `${root}/src/web` : root,
    branch: 'feat/example',
    config: loadConfig(readFileSync('.claude/gates.json', 'utf8')),
    authority: null,
    runnerTrusted: trusted,
    read: () => null,
    committed: () => false,
    isDir: () => false,
  });
}

function bash(command: string, trusted: Trusted, options: { agentType?: string; cwdSub?: boolean } = {}) {
  const { agentType = '', ...rest } = options;
  return run({ tool_name: 'Bash', tool_input: { command }, agent_type: agentType }, trusted, rest);
}

test.each(['ls', 'git status'])('gewone Bash %s roept de runner-vertrouwensfunctie nooit aan', (command) => {
  const trusted = vi.fn(() => true);
  bash(command, trusted);
  expect(trusted).not.toHaveBeenCalled();
});

test.each([
  ['Edit', { file_path: 'src/web/a.ts', old_string: 'a', new_string: 'b' }],
  ['Write', { file_path: 'src/web/a.ts', content: 'x' }],
  ['mcp__github__get_issue', {}],
])('%s roept de runner-vertrouwensfunctie nooit aan', (tool, input) => {
  const trusted = vi.fn(() => true);
  run({ tool_name: tool, tool_input: input, agent_type: '' }, trusted);
  expect(trusted).not.toHaveBeenCalled();
});

test('pnpm test:db roept de functie precies een keer aan en wordt dan toegelaten', () => {
  const trusted = vi.fn(() => true);
  const result = bash('pnpm test:db', trusted);
  expect(trusted).toHaveBeenCalledTimes(1);
  expect(result.allow).toBe(true);
});

test('pnpm test:db met een functie die false geeft is niet allow', () => {
  const trusted = vi.fn(() => false);
  const result = bash('pnpm test:db', trusted);
  expect(trusted).toHaveBeenCalledTimes(1);
  expect(result.allow).toBeUndefined();
});

test('--sta-wijzigingen-toe zonder automaticRunner-match blijft deny en roept de functie niet aan', () => {
  const trusted = vi.fn(() => true);
  const result = bash('node scripts/kit/iets.mjs --sta-wijzigingen-toe', trusted);
  expect(result.deny).not.toHaveLength(0);
  expect(result.allow).toBeUndefined();
  expect(trusted).not.toHaveBeenCalled();
});

test('pnpm test:db buiten de root roept de functie niet aan en is niet allow', () => {
  const trusted = vi.fn(() => true);
  const result = bash('pnpm test:db', trusted, { agentType: 'developer', cwdSub: true });
  expect(trusted).not.toHaveBeenCalled();
  expect(result.allow).toBeUndefined();
});

test.each(['pnpm test:db', 'pnpm run gate:slow', 'pnpm ui:check', 'pnpm gate:fast', 'ls'])(
  'functievariant geeft dezelfde beslissing als de boolean voor %s',
  (command) => {
    for (const value of [true, false]) {
      for (const role of ['', 'developer']) {
        expect(bash(command, () => value, { agentType: role })).toEqual(bash(command, value, { agentType: role }));
      }
    }
  },
);

test('een onbekende subagent roept de functie niet aan voor een gewone Bash', () => {
  const trusted = vi.fn(() => true);
  bash('ls', trusted, { agentType: 'onbekende-rol' });
  expect(trusted).not.toHaveBeenCalled();
});

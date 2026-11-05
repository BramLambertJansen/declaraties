import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

// Het echte entry-script, met een runner-authority waarvan trustedRunner gooit (via een resolve-hook): faalt dicht.
test('CLI: gooit de runnerfunctie, dan weigert het rolhek met exit 2', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rolhek-runner-gooit-'));
  try {
    const real = pathToFileURL(path.resolve('rails/hooks/lib/runner-authority.mjs')).href;
    const stub = path.join(dir, 'runner-stub.mjs');
    writeFileSync(
      stub,
      `export * from ${JSON.stringify(real)};\nexport function trustedRunner() { throw new Error('runner kapot'); }\n`,
    );
    const hook = path.join(dir, 'hook.mjs');
    writeFileSync(
      hook,
      `import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (result.url !== ${JSON.stringify(real)} || context.parentURL === ${JSON.stringify(pathToFileURL(stub).href)}) return result;
    return { ...result, url: ${JSON.stringify(pathToFileURL(stub).href)} };
  },
});`,
    );
    const root = process.cwd();
    const result = spawnSync(process.execPath, ['--import', hook, 'rails/hooks/rolhek.mjs'], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'pnpm test:db' }, cwd: root }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    expect([result.status, result.stdout]).toStrictEqual([2, '']);
    expect(result.stderr).toContain('rolhek: interne fout, daarom geweigerd: runner kapot');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('een onbekende subagent roept de functie niet aan voor een gewone Bash', () => {
  const trusted = vi.fn(() => true);
  bash('ls', trusted, { agentType: 'onbekende-rol' });
  expect(trusted).not.toHaveBeenCalled();
});

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { configReadsOnly, decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// `git config` met een sleutel die een programma start (core.fsmonitor, diff.external, core.sshCommand, ...) schrijft
// .git/config; de hooks draaien git daarna buiten de sandbox (git status, git ls-files --others) en starten dat programma.
// Schrijven in .git is voor elke rol verboden (ADR 0045); via git config gold dat alleen voor een paar sleutels.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const SUBAGENTS = ['developer', 'tester', 'reviewer', 'architect', 'docs'] as const;

function verdict(command: string, agent?: string): 'allow' | 'ask' | 'deny' {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    { root: ROOT, cwd: ROOT, config, read: () => null, committed: () => false, isDir: () => false, branch: 'feat/x' },
  );
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

const SCHRIJVEN = [
  "git config core.fsmonitor 'touch x'",
  'git config diff.external /bin/sh',
  "git config core.sshCommand 'touch x'",
  'git config core.pager less',
  'git config filter.x.clean cat',
  'git config set core.fsmonitor x',
  'git config --add core.fsmonitor x',
  'git config --replace-all core.fsmonitor x',
  'git config --unset core.fsmonitor',
  'git config --local core.fsmonitor x',
  'git config -f x.cfg core.fsmonitor x',
  'git config --file=x.cfg core.fsmonitor x',
  'git config --remove-section core',
  'git config --rename-section core x',
  'git config -e',
  'git config edit',
  'git -C . config core.fsmonitor x',
  'git config --onbekend core.fsmonitor',
  // Opties na de sleutel zijn voor git een value-pattern: dit zet de sleutel.
  "git config core.fsmonitor 'touch x' --get",
  "git config core.fsmonitor 'touch x' -l",
  "git config --file .git/config core.fsmonitor 'touch x' --get",
  // Een alias via -c verbergt het subcommando; init met een template zet hooks in .git/hooks.
  "git -c alias.cf=config cf core.fsmonitor 'touch x'",
  'git -c alias.st=status st',
  'git init --template=/tmp/t',
  'git init --template /tmp/t',
  'git -c init.templateDir=/tmp/t init',
];

const LEZEN = [
  'git config --get core.fsmonitor',
  'git config --get-all remote.origin.fetch',
  'git config --get-regexp ^alias',
  'git config --list',
  'git config -l --show-origin',
  'git config --list --name-only',
  'git config get core.fsmonitor',
  'git config list',
  'git config user.email',
  'git config --type=bool core.bare',
  'git config --type bool --get core.bare',
  'git config -f .gitmodules --list',
  'git config -t bool core.bare',
  'git config --bool-or-str core.bare',
  'git config -- core.bare',
  // Na de sleutel is --unset voor git een value-pattern: dit leest (nagespeeld met git 2.43).
  'git config --get core.fsmonitor --unset',
];

describe('git: blijvend programma (config, alias, init-template)', () => {
  test.each(SCHRIJVEN)('subagent geweigerd: %s', (command) => {
    expect(SUBAGENTS.map((rol) => verdict(command, rol))).toStrictEqual(SUBAGENTS.map(() => 'deny'));
  });

  test.each(SCHRIJVEN)('hoofdsessie vraagt de eigenaar: %s', (command) => {
    expect(verdict(command)).toBe('ask');
  });
});

describe('git config: lezen', () => {
  test('GIT_TEMPLATE_DIR is voor elke rol verboden', () => {
    const rollen = [undefined, ...SUBAGENTS];
    expect(rollen.map((rol) => verdict('GIT_TEMPLATE_DIR=/tmp/t git init', rol))).toStrictEqual(
      rollen.map(() => 'deny'),
    );
  });

  test.each(['git init', 'git init /tmp/claude-0/nieuw'])('git init zonder template blijft mogen: %s', (command) => {
    expect([verdict(command), verdict(command, 'developer')]).toStrictEqual(['allow', 'allow']);
  });

  test.each(LEZEN)('telt als lezen: %s', (command) => {
    const rest = command
      .replace(/^git config ?/, '')
      .split(' ')
      .filter(Boolean);
    expect(configReadsOnly(rest)).toBe(true);
  });

  test.each(LEZEN)('hoofdsessie en developer mogen: %s', (command) => {
    expect([verdict(command), verdict(command, 'developer')]).toStrictEqual(['allow', 'allow']);
  });
});

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { readAuthority, repositoryName } from '../../rails/hooks/lib/authority-context.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { unchangedHead } from '../../scripts/kit/status-git.mjs';

const SPEC = 'docs/specs/example.md';
const SOURCE = 'src/core/web/ui/example.tsx';
const BODY = '---\nstatus: voorstel\nnamespace: example\n---\n\n# Voorbeeld\n\n## Hergebruik en UX\n\nBestaande kit.\n';
const SCRIPT = path.resolve('scripts/kit/document-status.mjs');
const CHECKER = path.resolve('scripts/kit/check-document-status.mjs');
const HOOK = path.resolve('rails/hooks/rolhek.mjs');
const CONFIG = readFileSync('.claude/gates.json', 'utf8');
const directories: string[] = [];

function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function write(root: string, file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function commit(root: string): string {
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'test: fixture']);
  return git(root, ['rev-parse', 'HEAD']);
}

function fixture(): { root: string; base: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'task-authority-'));
  directories.push(root);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 'test@example.test']);
  git(root, ['remote', 'add', 'origin', 'https://github.com/BramLambertJansen/template.git']);
  write(root, SPEC, BODY);
  write(root, SOURCE, 'export const version = 1;\n');
  write(root, '.claude/gates.json', CONFIG);
  write(
    root,
    '.claude/decisions.json',
    JSON.stringify({
      version: 1,
      requiredChecks: ['gate:fast'],
      decisions: [
        {
          file: SPEC,
          digest: documentInfo(SPEC, BODY)?.digest,
          repository: 'BramLambertJansen/template',
          branch: 'feat/example',
          status: 'goedgekeurd',
          paths: [SOURCE],
        },
      ],
    }),
  );
  const base = commit(root);
  git(root, ['update-ref', 'refs/remotes/origin/main', base]);
  git(root, ['switch', '-c', 'feat/example']);
  return { root, base };
}

function approve(root: string): string {
  return execFileSync(process.execPath, [SCRIPT, SPEC, 'goedgekeurd'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function check(context: { root: string; base: string }): string {
  return execFileSync(process.execPath, [CHECKER], {
    cwd: context.root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BASE_SHA: context.base,
      HEAD_SHA: git(context.root, ['rev-parse', 'HEAD']),
      HEAD_REF: 'feat/example',
      REPO: 'BramLambertJansen/template',
    },
  });
}

afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('taakmandaat tegen echte git-objecten', () => {
  test('branchwissel op dezelfde commit maakt lopende bewijscontrole ongeldig', () => {
    const { root, base } = fixture();
    const expected = { head: base, base, branch: 'feat/example' };
    expect(unchangedHead(root, expected)).toBe(true);
    git(root, ['switch', '-c', 'feat/other']);
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(base);
    expect(unchangedHead(root, expected)).toBe(false);
  });

  test('een nieuwe vertrouwde basis vraagt hercontrole zonder gewijzigde HEAD', () => {
    const { root, base } = fixture();
    write(root, 'README.md', 'Nieuwe basis.');
    const head = commit(root);
    const expected = { head, base, branch: 'feat/example' };
    expect(unchangedHead(root, expected)).toBe(true);
    git(root, ['update-ref', 'refs/remotes/origin/main', head]);
    expect(unchangedHead(root, expected)).toBe(false);
  });

  test('het echte rolhek gebruikt de gates uit main bij een lokaal weggehaalde core-bescherming', () => {
    const { root } = fixture();
    // Een pad uit altijdVragen: in de template-repo staat de onderhoudsmodus aan (ADR 0045), waarin scripts/** alleen een melding is.
    write(root, '.claude/gates.json', CONFIG.replaceAll('".github/**",', ''));
    const payload = {
      cwd: root,
      tool_name: 'Write',
      agent_type: 'developer',
      tool_input: { file_path: path.join(root, '.github/workflows/unapproved.yml'), content: 'on: push' },
    };
    expect(() =>
      execFileSync(process.execPath, [HOOK], {
        cwd: root,
        input: JSON.stringify(payload),
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ).toThrow(/beschermd pad/);
  });

  // AC-15 (compacte-kennisbasis-rails): record geeft niets meer; docs:status schrijft alleen nog gebouwd, dus ook met een
  // passend record op main wordt goedgekeurd geweigerd en blijft de werkmap schoon.
  test('de statushelper weigert goedgekeurd ook met een record op main en wijzigt niets', () => {
    const { root } = fixture();
    expect(readAuthority({ root })).not.toBeNull();
    expect(() => approve(root)).toThrow(/besluit-PR/);
    expect(readFileSync(path.join(root, SPEC), 'utf8')).toBe(BODY);
    expect(git(root, ['status', '--porcelain'])).toBe('');
  });

  // AC-15: record geeft niets meer; de developer krijgt geen allow en geen Taakmandaat-melding, een onbekende subagent blijft deny.
  test('het rolhek geeft de developer geen allow voor een pad uit het record en weigert een onbekende subagent', () => {
    const { root } = fixture();
    const ctx = {
      root,
      cwd: root,
      config: loadConfig(CONFIG),
      authority: readAuthority({ root }),
      branch: 'feat/example',
      read: (file: string) => {
        try {
          return readFileSync(path.join(root, file), 'utf8');
        } catch {
          return null;
        }
      },
      committed: () => false,
      isDir: () => false,
    };
    const call = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(root, SOURCE), content: 'export const version = 2;' },
    };
    expect(decide({ ...call, agent_type: 'developer' }, ctx).allow).toBeUndefined();
    expect(decide({ ...call, agent_type: 'developer' }, ctx).context).not.toContainEqual(
      expect.stringContaining('Taakmandaat:'),
    );
    expect(decide({ ...call, agent_type: 'Explore' }, ctx).deny).not.toHaveLength(0);
    const compound = {
      tool_name: 'Bash',
      agent_type: 'developer',
      tool_input: { command: `echo x > ${SOURCE}; docker run untrusted` },
    };
    expect(decide(compound, ctx).context).not.toContainEqual(expect.stringContaining('Taakmandaat:'));
    expect(decide(compound, ctx).allow).toBeUndefined();
    write(root, 'private/example.tsx', 'Ongewijzigde fixture.');
    mkdirSync(path.join(root, 'private/directory'));
    const link = path.join(root, 'src/core/web/ui/link');
    symlinkSync(path.join(root, 'private/directory'), link);
    const alias = {
      ...call,
      agent_type: 'developer',
      tool_input: { ...call.tool_input, file_path: `${link}/../example.tsx` },
    };
    // ADR 0046 punt 28: src/core is geen voorReview-pad meer, dus geen deny; het mandaat geldt niet voor het alias.
    expect(decide(alias, ctx).context).not.toContainEqual(expect.stringContaining('Taakmandaat:'));
    expect(decide(alias, ctx).allow).toBeUndefined();
  });

  test('zonder leesbare basis ontstaan geen rechten', () => {
    const { root } = fixture();
    const base = git(root, ['rev-parse', 'refs/remotes/origin/main']);
    expect(readAuthority({ root })).not.toBeNull();
    git(root, ['update-ref', '-d', 'refs/remotes/origin/main']);
    expect(readAuthority({ root })).toBeNull();
    // Controle: het ontbreken van de basis is de oorzaak; met de basis terug is er weer een authority.
    git(root, ['update-ref', 'refs/remotes/origin/main', base]);
    expect(readAuthority({ root })).not.toBeNull();
  });

  // AC-14/AC-15: de taakscope bestaat niet meer; de check slaagt voor code bij een record op main zonder mandaat- of
  // taakscopetekst. De scope-uitbreiding via de PR-registry (tweede helft van de oude test) is vervallen met het mandaat.
  test('de CI-check slaagt voor een codewijziging bij een record op main, zonder mandaat- of taakscopetekst', () => {
    const context = fixture();
    write(context.root, SOURCE, 'export const version = 2;\n');
    commit(context.root);
    const uitvoer = check(context);
    expect(uitvoer).toContain('document-status:');
    expect(uitvoer).not.toMatch(/manda+te?|taakscope/i);
  });

  // GEWIJZIGD (ADR 0046 punt 7): inhoud van een goedgekeurde spec wijzigen mag in een besluit-PR zonder code; het record
  // (--path-mandaat) vervalt daardoor. Code onder dat mandaat in dezelfde PR blijft geweigerd tot er een nieuw record is.
  // AC-14: het tweede deel (code onder het vervallen mandaat faalt) is vervallen met het mandaat; `approve` (goedgekeurd) wordt nu altijd geweigerd.
  test('de CI-check laat inhoudswijziging van een spec toe zonder code', () => {
    const context = fixture();
    write(context.root, SPEC, readFileSync(path.join(context.root, SPEC), 'utf8') + '\nNieuw gedrag.\n');
    commit(context.root);
    expect(check(context)).toContain('gecontroleerd');
  });
});

test.each([
  ['git@github.com:BramLambertJansen/template.git', 'BramLambertJansen/template'],
  ['https://github.com/BramLambertJansen/template.git', 'BramLambertJansen/template'],
  ['https://example.test/BramLambertJansen/template.git', null],
  ['/tmp/template', null],
])('repository-identiteit uit %s', (remote, expected) => {
  expect(repositoryName(remote)).toBe(expected);
});

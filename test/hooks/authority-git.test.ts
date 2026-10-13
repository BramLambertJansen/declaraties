import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { documentInfo } from '../../.claude/hooks/lib/document-state.mjs';
import { readAuthority, repositoryName } from '../../.claude/hooks/lib/authority-context.mjs';
import { canWriteProtected } from '../../.claude/hooks/lib/task-authority.mjs';
import { decide, loadConfig } from '../../.claude/hooks/lib/rolhek.mjs';
import { unchangedHead } from '../../scripts/kit/status-git.mjs';

const SPEC = 'docs/specs/example.md';
const SOURCE = 'src/core/web/ui/example.tsx';
const BODY = '---\nstatus: voorstel\nnamespace: example\n---\n\n# Voorbeeld\n\n## Hergebruik en UX\n\nBestaande kit.\n';
const SCRIPT = path.resolve('scripts/kit/document-status.mjs');
const CHECKER = path.resolve('scripts/kit/check-document-status.mjs');
const DECISION = path.resolve('scripts/kit/document-decision.mjs');
const HOOK = path.resolve('.claude/hooks/rolhek.mjs');
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
  return execFileSync(process.execPath, [SCRIPT, SPEC, 'goedgekeurd'], { cwd: root, encoding: 'utf8' });
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

  test('de besluithelper bereidt een record in .claude voor zonder zichzelf rechten te geven', () => {
    const { root } = fixture();
    const source = 'src/core/web/ui/new.tsx';
    const result = execFileSync(
      process.execPath,
      [DECISION, SPEC, 'goedgekeurd', '--branch', 'feat/example', '--path', source],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    expect(result).toContain('geen rechten actief');
    const record = readFileSync(path.join(root, '.claude/decisions.json'), 'utf8');
    expect(record).toContain(source);
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    expect(canWriteProtected({ file: source, role: 'developer' }, authority)).toBe(false);
    expect(authority.trusted('.claude/gates.json')).toBe(CONFIG);
  });

  test('het echte rolhek gebruikt de gates uit main bij een lokaal weggehaalde core-bescherming', () => {
    const { root } = fixture();
    write(root, '.claude/gates.json', CONFIG.replace('"src/core/**",', ''));
    const payload = {
      cwd: root,
      tool_name: 'Write',
      agent_type: 'developer',
      tool_input: { file_path: path.join(root, 'src/core/web/ui/unapproved.tsx'), content: 'export {};' },
    };
    expect(() =>
      execFileSync(process.execPath, [HOOK], {
        cwd: root,
        input: JSON.stringify(payload),
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    ).toThrow(/beschermd pad/);
  });

  test('de statushelper registreert het besluit uit main en opent uitsluitend de genoemde broncode', () => {
    const { root } = fixture();
    const authority = readAuthority({ root });
    expect(authority).not.toBeNull();
    if (authority === null) throw new Error('Fixture heeft geen authority');
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, authority)).toBe(false);
    expect(approve(root)).toContain('alleen de statusregel gewijzigd');
    expect(readFileSync(path.join(root, SPEC), 'utf8')).toBe(BODY.replace('status: voorstel', 'status: goedgekeurd'));
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, authority)).toBe(true);
    expect(canWriteProtected({ file: 'src/core/web/ui/extra.tsx', role: 'developer' }, authority)).toBe(false);
  });

  test('een gewijzigde registry in de werkmap verruimt het mandaat niet', () => {
    const { root } = fixture();
    approve(root);
    const registry = readFileSync(path.join(root, '.claude/decisions.json'), 'utf8');
    write(root, '.claude/decisions.json', registry.replace(SOURCE, 'src/core/web/ui/extra.tsx'));
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, authority)).toBe(true);
    expect(canWriteProtected({ file: 'src/core/web/ui/extra.tsx', role: 'developer' }, authority)).toBe(false);
  });

  test('het rolhek geeft expliciet allow voor de exacte developer en deny voor een onbekende subagent', () => {
    const { root } = fixture();
    approve(root);
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
    expect(decide({ ...call, agent_type: 'developer' }, ctx).allow).toBe(true);
    expect(decide({ ...call, agent_type: 'Explore' }, ctx).deny).not.toHaveLength(0);
    const compound = {
      tool_name: 'Bash',
      agent_type: 'developer',
      tool_input: { command: `echo x > ${SOURCE}; docker run untrusted` },
    };
    expect(decide(compound, ctx).context).toContainEqual(expect.stringContaining('Taakmandaat:'));
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
    expect(decide(alias, ctx).deny).not.toHaveLength(0);
    expect(decide(alias, ctx).allow).toBeUndefined();
  });

  test('een gewijzigde taakspec of branch trekt de bevoegdheid in', () => {
    const { root } = fixture();
    approve(root);
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    write(root, SPEC, readFileSync(path.join(root, SPEC), 'utf8') + '\nExtra gedrag.\n');
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, authority)).toBe(false);
    git(root, ['switch', '-c', 'feat/other']);
    const other = readAuthority({ root });
    if (other === null) throw new Error('Fixture heeft geen authority');
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, other)).toBe(false);
  });

  test('een symlink naar een ander bestand krijgt geen mandaat', () => {
    const { root } = fixture();
    approve(root);
    rmSync(path.join(root, SOURCE));
    symlinkSync(path.join(root, '.claude/gates.json'), path.join(root, SOURCE));
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, authority)).toBe(false);
  });

  test('intrekking in de nieuwe vertrouwde basis maakt een eerder werkend mandaat ongeldig', () => {
    const { root } = fixture();
    approve(root);
    write(root, '.claude/decisions.json', JSON.stringify({ version: 1, requiredChecks: ['gate:fast'], decisions: [] }));
    const withdrawn = commit(root);
    git(root, ['update-ref', 'refs/remotes/origin/main', withdrawn]);
    const authority = readAuthority({ root });
    if (authority === null) throw new Error('Fixture heeft geen authority');
    expect(canWriteProtected({ file: SOURCE, role: 'developer' }, authority)).toBe(false);
  });

  test('zonder leesbare basis ontstaan geen rechten', () => {
    const { root } = fixture();
    git(root, ['update-ref', '-d', 'refs/remotes/origin/main']);
    expect(readAuthority({ root })).toBeNull();
    expect(() => approve(root)).toThrow();
  });

  test('de CI-check accepteert de taak en weigert een scope-uitbreiding via de PR-registry', () => {
    const context = fixture();
    approve(context.root);
    write(context.root, SOURCE, 'export const version = 2;\n');
    commit(context.root);
    expect(check(context)).toContain('taakscope gecontroleerd vanuit main');
    const registry = readFileSync(path.join(context.root, '.claude/decisions.json'), 'utf8');
    write(context.root, '.claude/decisions.json', registry.replace(SOURCE, 'src/core/web/ui/extra.tsx'));
    write(context.root, 'src/core/web/ui/extra.tsx', 'export {};\n');
    commit(context.root);
    expect(() => check(context)).toThrow();
  });

  test('de CI-check weigert inhoudswijziging onder een ongewijzigde goedgekeurd-status', () => {
    const context = fixture();
    approve(context.root);
    write(context.root, SPEC, readFileSync(path.join(context.root, SPEC), 'utf8') + '\nNieuw gedrag.\n');
    commit(context.root);
    expect(() => check(context)).toThrow();
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

import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as guard from '../../scripts/kit/diff-guard.mjs';

// Bytetelling in de diff-guard (spec agent-merge-bytegrens AC-3): `bytesArgs(splitsing, head)` is de git-aanroep,
// `parseDiffBytes(buffer)` telt de uitvoer (kopregels per bestand overgeslagen, de rest met `patchBytes`), en
// `leesBytes(splitsing, head, { cwd, maxBuffer })` voert hem uit zoals `leesPr()` en geeft `undefined` bij te grote of
// onleesbare uitvoer. De exports worden via de module opgehaald, zodat dit bestand vóór de bouw compileert.
function functie(naam: string): (...args: unknown[]) => unknown {
  const waarde: unknown = Reflect.get(guard, naam);
  if (typeof waarde !== 'function') throw new Error(`scripts/kit/diff-guard.mjs exporteert ${naam} niet als functie`);
  return (...args: unknown[]): unknown => {
    const resultaat: unknown = Reflect.apply(waarde, undefined, args);
    return resultaat;
  };
}

function tekstLijst(waarde: unknown): string[] {
  if (!Array.isArray(waarde) || !waarde.every((item) => typeof item === 'string'))
    throw new Error('bytesArgs geeft geen lijst met tekst');
  return waarde.map(String);
}

const opruimen: string[] = [];
afterEach(() => {
  for (const map of opruimen.splice(0)) rmSync(map, { recursive: true, force: true });
});

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'diffbytes-'));
  opruimen.push(root);
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'core.autocrlf=false', ...args],
      { cwd: root, encoding: 'utf8' },
    );
  git('init', '-q');
  const schrijf = (pad: string, inhoud: string) => {
    writeFileSync(path.join(root, pad), inhoud);
  };
  const commit = (bericht: string) => {
    git('add', '-A');
    git('commit', '-qm', bericht);
    return git('rev-parse', 'HEAD').trim();
  };
  return { root, git, schrijf, commit };
}

describe('agent-merge-bytegrens/AC-3 bytetelling in de diff-guard', () => {
  test('agent-merge-bytegrens/AC-3: de git-aanroep is diff -U0 zonder kleur, ext-diff of textconv, met hernoemingen', () => {
    expect(functie('bytesArgs')('b'.repeat(40), 'a'.repeat(40))).toEqual([
      'diff',
      '-U0',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--find-renames',
      'b'.repeat(40),
      'a'.repeat(40),
    ]);
  });

  test('agent-merge-bytegrens/AC-3: parseDiffBytes slaat de kopregels per bestand over', () => {
    const uitvoer = [
      'diff --git a/n.sql b/n.sql',
      'new file mode 100644',
      'index 0000000..bb8c3c7',
      '--- /dev/null',
      '+++ b/n.sql',
      '@@ -0,0 +1,2 @@',
      '+++x',
      '+-- sql',
      'diff --git a/weg.sql b/weg.sql',
      'deleted file mode 100644',
      'index c908808..0000000',
      '--- a/weg.sql',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '--- weg',
      'diff --git a/oud.ts b/nieuw.ts',
      'similarity index 100%',
      'rename from oud.ts',
      'rename to nieuw.ts',
      '',
    ].join('\n');
    // ++x (3) en -- sql (6) uit n.sql, -- weg (6) uit weg.sql; de hernoeming heeft alleen kopregels.
    expect(functie('parseDiffBytes')(Buffer.from(uitvoer))).toBe(15);
  });

  test('agent-merge-bytegrens/AC-3: een echte repo: tekst, é, CRLF, geen newline, ++x, -- sql en een hernoeming', () => {
    const { root, schrijf, commit } = repo();
    schrijf('a.ts', 'een\ntwee\n');
    schrijf('oud.ts', `${'x'.repeat(100)}\n`);
    schrijf('crlf.ts', 'a\r\n');
    schrijf('weg.sql', '-- weg\n');
    schrijf('nn.ts', 'x');
    const basis = commit('basis');
    schrijf('a.ts', 'een\ndrie é\nvier\n');
    renameSync(path.join(root, 'oud.ts'), path.join(root, 'nieuw.ts'));
    schrijf('crlf.ts', 'bc\r\n');
    rmSync(path.join(root, 'weg.sql'));
    schrijf('n.sql', '++x\n-- sql\n');
    schrijf('nn.ts', 'y');
    const head = commit('wijziging');
    // a.ts: twee (4) + drie é (7) + vier (4); crlf.ts: a\r (2) + bc\r (3); n.sql: 9; weg.sql: 6; nn.ts: 2; hernoeming: 0.
    const uitvoer = execFileSync('git', tekstLijst(functie('bytesArgs')(basis, head)), { cwd: root });
    expect(functie('parseDiffBytes')(uitvoer)).toBe(37);
    expect(functie('leesBytes')(basis, head, { cwd: root })).toBe(37);
  });

  test('agent-merge-bytegrens/AC-3: een zuivere hernoeming telt 0 bytes', () => {
    const { root, schrijf, commit } = repo();
    schrijf('oud.ts', `${'x'.repeat(5000)}\n`);
    const basis = commit('basis');
    renameSync(path.join(root, 'oud.ts'), path.join(root, 'nieuw.ts'));
    const head = commit('hernoemd');
    expect(functie('leesBytes')(basis, head, { cwd: root })).toBe(0);
  });

  test('agent-merge-bytegrens/AC-3: te grote uitvoer (kleine maxBuffer, ENOBUFS) geeft undefined, geen crash', () => {
    const { schrijf, commit, root } = repo();
    schrijf('a.ts', 'een\n');
    const basis = commit('basis');
    schrijf('a.ts', `${'x'.repeat(10_000)}\n`);
    const head = commit('groot');
    expect(() => functie('leesBytes')(basis, head, { cwd: root, maxBuffer: 64 })).not.toThrow();
    expect(functie('leesBytes')(basis, head, { cwd: root, maxBuffer: 64 })).toBeUndefined();
    expect(functie('leesBytes')(basis, head, { cwd: root })).toBe(10_003);
  });

  test('agent-merge-bytegrens/AC-3: een onleesbare diff (onbekende SHA) geeft undefined, geen crash', () => {
    const { schrijf, commit, root } = repo();
    schrijf('a.ts', 'een\n');
    const head = commit('basis');
    expect(functie('leesBytes')('f'.repeat(40), head, { cwd: root })).toBeUndefined();
  });
});

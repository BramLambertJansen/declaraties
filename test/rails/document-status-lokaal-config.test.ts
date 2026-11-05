import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { inKooi } from '../../scripts/kit/kooi.mjs';

// Spec document-status-lokaal, AC-1 (pre-push-job) en AC-8 (docs noemen dat git push de volgorde al toetst).

/** De regels van een top-level sleutel in lefthook.yml, tot de volgende top-level sleutel. */
function lefthookSectie(naam: string): string[] {
  const regels = readFileSync('lefthook.yml', 'utf8').split('\n');
  const start = regels.indexOf(`${naam}:`);
  if (start === -1) return [];
  const rest = regels.slice(start + 1);
  const einde = rest.findIndex((regel) => /^[^\s#]/.test(regel));
  return einde === -1 ? rest : rest.slice(0, einde);
}

/** De regels van de job `name: <naam>` in een sectie, tot de volgende job. */
function job(sectie: string[], naam: string): string[] {
  const start = sectie.findIndex((regel) => regel.trim() === `- name: ${naam}`);
  if (start === -1) return [];
  const rest = sectie.slice(start + 1);
  const einde = rest.findIndex((regel) => regel.trim().startsWith('- name:'));
  return [sectie[start] ?? '', ...(einde === -1 ? rest : rest.slice(0, einde))];
}

/** Het run-commando van een job, ook als blokscalar (`run: |`). */
function runCommando(regels: string[]): string {
  const index = regels.findIndex((regel) => /^\s*run:/.test(regel));
  if (index === -1) return '';
  const eerste = (regels[index] ?? '').replace(/^\s*run:\s*/, '');
  if (!['|', '>', '|-', '>-'].includes(eerste.trim())) return eerste.trim();
  const inspring = (regels[index] ?? '').search(/\S/);
  const blok = regels.slice(index + 1);
  const einde = blok.findIndex((regel) => regel.trim() !== '' && regel.search(/\S/) <= inspring);
  return (einde === -1 ? blok : blok.slice(0, einde)).map((regel) => regel.trim()).join('\n');
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Draait het run-commando in de kooi (R-TOOL-03) in een lege werkmap, eventueel met een stub op de plek van het script. */
function draai(commando: string, stub: string | null) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'document-status-job-')));
  dirs.push(dir);
  if (stub !== null) {
    mkdirSync(path.join(dir, 'scripts/kit'), { recursive: true });
    writeFileSync(path.join(dir, 'scripts/kit/document-status-lokaal.mjs'), stub);
  }
  return inKooi(commando, { werkmap: dir, timeout: 20_000 }).status;
}

describe('lefthook pre-push: job document-status (AC-1)', () => {
  const commando = runCommando(job(lefthookSectie('pre-push'), 'document-status'));

  test('draait scripts/kit/document-status-lokaal.mjs --pre-push achter een bestaansguard', () => {
    expect(commando).toContain('scripts/kit/document-status-lokaal.mjs --pre-push');
    // `test -f … &&` of `test ! -f … ||`: beide slaan de job over als het script ontbreekt.
    expect(commando).toMatch(/\btest\s+(?:!\s+)?-f\s+scripts\/kit\/document-status-lokaal\.mjs\b/);
  });

  test('gate-fast en main-achterstand blijven naast de nieuwe job', () => {
    const sectie = lefthookSectie('pre-push');

    expect(job(sectie, 'gate-fast')).not.toStrictEqual([]);
    expect(job(sectie, 'main-achterstand')).not.toStrictEqual([]);
  });

  test('ná main-achterstand (die origin/main ophaalt), met use_stdin: true', () => {
    const sectie = lefthookSectie('pre-push');
    const positie = (naam: string) => sectie.findIndex((regel) => regel.trim() === `- name: ${naam}`);

    expect(positie('main-achterstand')).toBeGreaterThan(-1);
    expect(positie('document-status')).toBeGreaterThan(positie('main-achterstand'));
    expect(job(sectie, 'document-status').map((regel) => regel.trim())).toContain('use_stdin: true');
  });

  test('zonder het script in de werkmap (oude checkout) slaagt de job', () => {
    expect(commando).not.toBe('');
    expect(draai(commando, null)).toBe(0);
  });

  test('met het script blokkeert een exitcode 1 de push (geen || true), met --pre-push als argument', () => {
    expect(commando).not.toBe('');
    expect(draai(commando, "process.exit(process.argv.includes('--pre-push') ? 1 : 0);\n")).not.toBe(0);
  });

  test('met het script slaagt een exitcode 0', () => {
    expect(commando).not.toBe('');
    expect(draai(commando, 'process.exit(0);\n')).toBe(0);
  });
});

describe('docs noemen dat git push de volgorde toetst (AC-8)', () => {
  test('stap 8 van de spec-skill', () => {
    const stap = readFileSync('.claude/skills/spec/SKILL.md', 'utf8')
      .split('\n')
      .find((regel) => regel.startsWith('8. '));

    expect(stap).toContain('git push');
    expect(stap).toContain('volgorde');
  });

  test('de pre-push-alinea in docs/operations/agent-doorloop.md', () => {
    const alineas = readFileSync('docs/operations/agent-doorloop.md', 'utf8').split(/\n\s*\n/);
    const alinea = alineas.find((tekst) => /pre-push/i.test(tekst) && tekst.includes('git push'));

    expect(alinea).toBeDefined();
    // De volgorde van ADR 0062 punt 3: bij naam of in de vorm van de regel.
    expect(alinea).toMatch(/volgorde|vóór de eerste code/);
  });

  test('R-CI-04 in docs/framework.md', () => {
    const regel = readFileSync('docs/framework.md', 'utf8')
      .split('\n')
      .find((tekst) => tekst.startsWith('- **R-CI-04**'));

    expect(regel).toMatch(/pre-push|git push/);
    expect(regel).toContain('volgorde');
  });

  test('de git-hooks in docs/nieuwe-app.md', () => {
    const regels = readFileSync('docs/nieuwe-app.md', 'utf8').split('\n');

    expect(regels.some((tekst) => /pre-push|git push/.test(tekst) && tekst.includes('volgorde'))).toBe(true);
  });
});

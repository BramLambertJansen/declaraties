import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// ADR 0045 punt 20: guard.yml heeft de jobs `diff-guard` en `document-status`; `check-core` (ADR 0040) kwam erbij. Alle
// draaien met pull_request_target en behandelen de PR als git-data: geen checkout van de PR, `persist-credentials: false`, geen install.
const WORKFLOW = readFileSync(path.join(import.meta.dirname, '../../.github/workflows/guard.yml'), 'utf8');

function job(name: string): string {
  const start = WORKFLOW.search(new RegExp(`^ {2}${name}:$`, 'm'));
  if (start < 0) throw new Error(`job ${name} ontbreekt in guard.yml`);
  const rest = WORKFLOW.slice(start + 1);
  const next = rest.search(/^ {2}[a-z][a-z-]*:$/m);
  return next < 0 ? rest : rest.slice(0, next);
}

describe.each([
  ['diff-guard', 'diff-guard.mjs'],
  ['document-status', 'check-document-status.mjs'],
  ['check-core', 'check-core.mjs'],
])('guard.yml job %s', (name, script) => {
  const tekst = job(name);

  test('heeft zijn eigen jobnaam, zodat de checklijst de oorzaak toont', () => {
    expect(tekst).toMatch(new RegExp(`^ {4}name: ${name}$`, 'm'));
  });

  test('draait zijn script uit de checkout van de base-SHA', () => {
    expect(tekst).toContain(`node scripts/kit/${script}`);
    expect(tekst).toContain('ref: ${{ github.event.pull_request.base.sha }}');
  });

  test('checkt de PR niet uit en bewaart geen credentials', () => {
    expect(tekst).toContain('persist-credentials: false');
    expect(tekst).not.toMatch(/ref: \$\{\{ github\.event\.pull_request\.head/);
    expect(tekst).not.toContain('github.head_ref');
  });

  test('installeert niets uit de PR', () => {
    expect(tekst).not.toMatch(/\b(?:pnpm|npm|yarn) (?:i|install|ci|add)\b/);
  });

  test("controleert base-repo en SHA's", () => {
    expect(tekst).toContain('Base-repo en SHA');
    expect(tekst).toMatch(/\[0-9a-f\]\{40\}/);
  });
});

test('het script van document-status draait in een eigen job, niet als stap van diff-guard', () => {
  expect(job('diff-guard')).not.toContain('check-document-status.mjs');
});

// De jobs zijn gelijk tot en met de laatste stap (de eigen controle): wie een stap toevoegt, moet dat in beide doen en
// valt dan op in de review. Precies één checkout (van de base-SHA) en precies één `node scripts/kit/`-aanroep per job.
// Het `outputs:`-blok van diff-guard (oordeel agent-merge, ADR 0069) telt niet mee: alleen diff-guard geeft een uitslag door.
function zonderLaatsteStap(tekst: string, naam: string): string {
  const laatste = tekst.lastIndexOf('\n      - name:');
  return tekst
    .slice(0, laatste)
    .replace(/^ {4}outputs:\n(?: {6}.+\n)+/m, '')
    .replaceAll(naam, '<job>');
}

function stappen(tekst: string): string[] {
  return tekst.split(/\n(?= {6}- )/).slice(1);
}

describe('beide jobs behandelen de PR als git-data', () => {
  test.each(['document-status', 'check-core'])('%s: gelijk aan diff-guard tot en met de laatste stap', (name) => {
    expect(zonderLaatsteStap(job(name), name)).toBe(zonderLaatsteStap(job('diff-guard'), 'diff-guard'));
  });

  test.each([
    ['diff-guard', 'diff-guard.mjs'],
    ['document-status', 'check-document-status.mjs'],
    ['check-core', 'check-core.mjs'],
  ])('%s: precies één checkout, één node-aanroep en alleen zijn eigen script', (name, script) => {
    const tekst = job(name);
    expect(tekst.match(/uses: actions\/checkout@/g)).toHaveLength(1);
    expect(tekst.match(/node scripts\/kit\//g)).toHaveLength(1);
    expect(tekst).toContain(`node scripts/kit/${script}`);
    expect(tekst).not.toMatch(/\bgit (?:checkout|switch|merge(?!-base)|cherry-pick|worktree|reset)\b/);
  });

  test.each(['diff-guard', 'document-status', 'check-core'])(
    '%s: de laatste stap is de controle zelf, daarvoor geen run met PR-code',
    (name) => {
      const laatste = stappen(job(name)).at(-1) ?? '';
      expect(laatste).toMatch(/run: node scripts\/kit\/[a-z-]+\.mjs\s*$/);
    },
  );
});

// ADR 0069, spec agent-merge-niet-kritiek AC-2: de job agent-merge draait alleen bij oordeel `ja` van diff-guard en voert
// niets uit: geen checkout, geen node, geen install. Overgeslagen is geen rood, dus de eigenaar merget elke PR zoals nu.
describe('guard.yml job agent-merge', () => {
  const tekst = job('agent-merge');

  test('agent-merge-niet-kritiek/AC-2 hangt aan het oordeel van diff-guard en slaagt alleen bij ja', () => {
    expect(tekst).toMatch(/^ {4}name: agent-merge$/m);
    expect(tekst).toMatch(/^ {4}needs: diff-guard$/m);
    expect(tekst).toMatch(/^ {4}if: needs\.diff-guard\.outputs\.agent-merge == 'ja'$/m);
    expect(job('diff-guard')).toMatch(/^ {6}agent-merge: \$\{\{ steps\.diff-guard\.outputs\.agent-merge \}\}$/m);
    expect(job('diff-guard')).toMatch(/^ {8}id: diff-guard$/m);
  });

  test('agent-merge-niet-kritiek/AC-2 voert niets uit de PR uit', () => {
    expect(tekst).not.toContain('actions/checkout');
    const runs = tekst.split('\n').filter((regel) => /^\s+run:/.test(regel));
    expect(runs).toEqual(['        run: echo "agent-merge ja voor $HEAD_SHA"']);
    expect(tekst).not.toContain('github.head_ref');
    expect(tekst).not.toMatch(/run: .*\$\{\{/);
  });

  test('agent-merge-niet-kritiek/AC-2 de workflow draait alleen op pull_request_target', () => {
    expect(WORKFLOW).toMatch(/^on:\n {2}pull_request_target:/m);
    expect(WORKFLOW).not.toMatch(/^ {2}pull_request:/m);
  });
});

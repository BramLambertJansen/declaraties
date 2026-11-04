import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';

// De twee workflows van de leerlus met bewijs (ADR 0078, spec leerlus-bewijs AC-3 en AC-7): minimale rechten, geen token
// bij de PR-code, niets dat issues sluit, heropent of bewerkt, en geen event-tekst in een shellregel.
const CHECK = readFileSync('.github/workflows/leerpunt.yml', 'utf8');
const BEWIJS = readFileSync('.github/workflows/leerpunt-bewijs.yml', 'utf8');

/** Het blok onder een sleutel op een gegeven inspringing, tot de volgende regel met die of minder inspringing. */
function blok(tekst: string, sleutel: string, inspring: number): string {
  const regels = tekst.split('\n');
  const start = regels.findIndex((r) => r === `${' '.repeat(inspring)}${sleutel}:`);
  if (start === -1) return '';
  const rest = regels.slice(start + 1);
  const einde = rest.findIndex((r) => r.trim() !== '' && r.length - r.trimStart().length <= inspring);
  return (einde === -1 ? rest : rest.slice(0, einde)).join('\n');
}

const rechten = (tekst: string) =>
  blok(tekst, 'permissions', 0)
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '');

/** De stappen van de enige job, elk als tekstblok. */
function stappen(tekst: string): string[] {
  return tekst.split(/\n(?= {6}- )/).slice(1);
}
const stap = (tekst: string, naam: string) => stappen(tekst).find((s) => s.includes(`name: ${naam}\n`)) ?? '';

describe('leerlus-bewijs/AC-7 rechten', () => {
  test('leerlus-bewijs/AC-7: issue-check: issues write, plus pull-requests read voor closedByPullRequestsReferences', () => {
    expect(rechten(CHECK)).toEqual(['issues: write', 'pull-requests: read']);
  });

  test('leerlus-bewijs/AC-7: bewijsjob: alleen lezen', () => {
    expect(rechten(BEWIJS)).toEqual(['contents: read', 'pull-requests: read', 'issues: read']);
  });

  test.each([
    ['leerpunt.yml', CHECK],
    ['leerpunt-bewijs.yml', BEWIJS],
  ])('leerlus-bewijs/AC-7: %s: geen permissions per job', (_naam, tekst) => {
    expectAbsent(tekst, /^ +permissions:/m, {
      recognizes: ['    permissions:', '  permissions:'],
      allows: ['permissions:'],
    });
  });

  test('leerlus-bewijs/AC-7: triggers', () => {
    expect(CHECK).toMatch(/issues:\n\s+types: \[opened, edited, labeled, reopened, closed\]/);
    expect(CHECK).toMatch(/issue_comment:\n\s+types: \[created\]/);
    expect(BEWIJS).toMatch(/pull_request:\n\s+types: \[opened, synchronize, reopened, edited\]/);
    expectAbsent(BEWIJS, /^ *pull_request_target:/m, {
      recognizes: ['  pull_request_target:', 'pull_request_target:'],
      allows: ['# niet `pull_request_target`'],
    });
  });
});

describe('leerlus-bewijs/AC-7 niets sluiten, heropenen of bewerken', () => {
  const script = readFileSync('scripts/kit/leerpunt-check.mjs', 'utf8');

  test('leerlus-bewijs/AC-7: de issue-check zet alleen labels en één comment', () => {
    expectAbsent(script, /\bstate['"]?\s*:/, { recognizes: ['state: ', "'state':", 'state:'], allows: ['statement:'] });
    expectAbsent(script, /method: '(PUT|PATCH)', body: \{ (title|state|labels)/, {
      recognizes: ["method: 'PATCH', body: { state", "method: 'PUT', body: { labels", "method: 'PATCH', body: { title"],
    });
    const schrijf = [...script.matchAll(/api\(\s*(`[^`]*`|'[^']*'),\s*\{\s*method: '(POST|PATCH|PUT|DELETE)'/g)].map(
      (m) => `${m[2] ?? ''} ${m[1] ?? ''}`,
    );
    expect(schrijf).toEqual([
      "POST 'graphql'",
      'POST `${issue}/labels`',
      'DELETE `${issue}/labels/${encodeURIComponent(stap.label)}`',
      'POST `${issue}/comments`',
      "PATCH `repos/${repo}/issues/comments/${String(veld(bestaand, 'id'))}`",
    ]);
    expectAbsent(CHECK, /gh issue (close|reopen|edit)/, {
      recognizes: ['gh issue close 9', 'gh issue reopen', 'gh issue edit'],
    });
  });
});

describe('leerlus-bewijs/AC-3 en AC-7 geen token bij de PR-code', () => {
  test('leerlus-bewijs/AC-3: geen env op workflow- of jobniveau', () => {
    for (const tekst of [BEWIJS, CHECK])
      expectAbsent(tekst, /^( {4})?env:/m, { recognizes: ['env:', '    env:'], allows: ['        env:'] });
  });

  test('leerlus-bewijs/AC-3: alleen de stap voorbereiden heeft een token', () => {
    const metToken = stappen(BEWIJS).filter((s) => /TOKEN|secrets\./.test(s));
    expect(metToken).toHaveLength(1);
    expect(metToken[0]).toContain('name: voorbereiden\n');
    for (const naam of ['plan', 'basis', 'install', 'draai']) expect(stap(BEWIJS, naam)).not.toBe('');
  });

  test.each([
    ['leerpunt.yml', CHECK],
    ['leerpunt-bewijs.yml', BEWIJS],
  ])('leerlus-bewijs/AC-3: %s: checkout zonder token en met persist-credentials false', (_naam, tekst) => {
    const checkouts = stappen(tekst).filter((s) => s.includes('actions/checkout@'));
    expect(checkouts.length).toBeGreaterThan(0);
    for (const s of checkouts) {
      expect(s).toContain('persist-credentials: false');
      expectAbsent(s, /token:/, { recognizes: ['token:', '          token: ${{ secrets.X }}'] });
    }
  });

  test('leerlus-bewijs/AC-3: install uit de eigen lockfile zonder scripts', () => {
    const install = stap(BEWIJS, 'install');
    expect(install.match(/pnpm install --frozen-lockfile --ignore-scripts/g)).toHaveLength(2);
    expect(install).toContain('cd head');
    expect(install).toContain('cd "$RUNNER_TEMP/basis"');
  });

  test('leerlus-bewijs/AC-3: het script komt van de basis', () => {
    expect(BEWIJS).toContain('ref: ${{ github.event.pull_request.base.sha }}\n          path: kit');
    for (const s of stappen(BEWIJS).filter((x) => x.includes('run: node')))
      expect(s).toContain('node kit/scripts/kit/');
  });
});

describe('leerlus-bewijs/AC-7 geen event-tekst in een shellregel', () => {
  test.each([
    ['leerpunt.yml', CHECK],
    ['leerpunt-bewijs.yml', BEWIJS],
  ])('leerlus-bewijs/AC-7: %s', (_naam, tekst) => {
    const shell = stappen(tekst)
      .map((s) => s.split(/\n {8}run: /)[1] ?? '')
      .filter((r) => r !== '');
    expect(shell.length).toBeGreaterThan(0);
    for (const regel of shell)
      expectAbsent(regel, /\$\{\{/, {
        recognizes: ['${{ github.event.issue.body }}', 'echo "${{ x }}"'],
        allows: ['"$RUNNER_TEMP"'],
      });
  });
});

describe('leerlus-bewijs/AC-1 de bouw-PR zonder script op de basis', () => {
  test('leerlus-bewijs/AC-1: zonder script op de basis slaagt de job met een melding; anders draait elke stap', () => {
    const kit = stap(BEWIJS, 'kit');
    expect(kit).toContain('if [ -f kit/scripts/kit/leerpunt-bewijs.mjs ]');
    for (const naam of ['voorbereiden', 'plan', 'basis'])
      expect(stap(BEWIJS, naam)).toContain("if: steps.kit.outputs.aanwezig == 'true'");
    for (const naam of ['install', 'draai']) expect(stap(BEWIJS, naam)).toContain("steps.basis.outputs.runs == 'true'");
  });
});

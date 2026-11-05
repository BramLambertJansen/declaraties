import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { OUDE_KRITIEK, afgeleid, padNiveau } from '../../rails/hooks/lib/padtabel.mjs';
import { loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { leesAgentMerge, leesMergeConfig } from '../../scripts/kit/agent-merge.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { leesConfig } from '../../scripts/kit/diff-guard.mjs';
import { kritiekPad } from '../../scripts/kit/lane.mjs';
import { expectAbsent } from '../support/absence';
import { OUD, OUDE_GATES_TEKST, REPO, nieuw, nieuwePaden, repo } from './padtabel-kit';

// Spec padtabel (ADR 0079): de lezer `padNiveau`/`afgeleid` in rails/hooks/lib/padtabel.mjs, de oude vorm en `OUDE_KRITIEK`.

const OUDE_VOLLEDIGE_KRITIEK = [...OUD.kritiek, ...OUD.altijdVragen];

async function meldingen(paden: Record<string, unknown>): Promise<string[]> {
  return (await docsViolations(repo({ gatesTekst: JSON.stringify(nieuw(paden)) }))).map((v) => v.message);
}

describe('padtabel/AC-1 strengste wint, per kolom, in elke volgorde', () => {
  test.each([
    ['src/** eerst', { 'src/**': { besluit: 'agent' }, 'src/core/**': { schrijven: 'gate' } }],
    ['src/core/** eerst', { 'src/core/**': { schrijven: 'gate' }, 'src/**': { besluit: 'agent' } }],
  ])('%s: src/core/x.ts is schrijven gate en besluit eigenaar (padtabel/AC-1)', (_naam, paden) => {
    expect(padNiveau('src/core/x.ts', { paden })).toMatchObject({ schrijven: 'gate', besluit: 'eigenaar' });
  });

  test('src/web/x.ts valt alleen onder src/**: vrij en agent (padtabel/AC-1)', () => {
    const paden = { 'src/core/**': { schrijven: 'gate' }, 'src/**': { besluit: 'agent' } };
    expect(padNiveau('src/web/x.ts', { paden })).toMatchObject({ schrijven: 'vrij', besluit: 'agent' });
  });
});

describe('padtabel/AC-4 onleesbare rij telt streng, een lege rij als vrij/eigenaar', () => {
  test.each([
    ['onbekende kolom', { schrijven: 'gate', kleur: 'rood' }, 'onbekende sleutel kleur'],
    ['onbekende waarde', { schrijven: 'streng' }, 'onbekende waarde streng'],
  ])('%s: padNiveau altijdVragen/besluit-pr en check-docs rood (padtabel/AC-4)', async (_naam, rij, tekst) => {
    const paden = { ...nieuwePaden(), 'extra/**': rij };
    expect(padNiveau('extra/x.ts', { paden })).toMatchObject({ schrijven: 'altijdVragen', besluit: 'besluit-pr' });
    expect(await meldingen(paden)).toContain(`.claude/gates.json: paden.extra/**: ${tekst}`);
  });

  test('een rij die geen object is telt bij lezen als altijdVragen/besluit-pr (padtabel/AC-4)', () => {
    expect(padNiveau('extra/x.ts', { paden: { 'extra/**': 'gate' } })).toMatchObject({
      schrijven: 'altijdVragen',
      besluit: 'besluit-pr',
    });
  });

  test('{}: padNiveau vrij/eigenaar en check-docs rood met "rij zonder kolom" (padtabel/AC-4)', async () => {
    const paden = { ...nieuwePaden(), 'extra/**': {} };
    expect(padNiveau('extra/x.ts', { paden })).toMatchObject({ schrijven: 'vrij', besluit: 'eigenaar' });
    expect(await meldingen(paden)).toContain('.claude/gates.json: paden.extra/**: rij zonder kolom');
  });

  test('paden geen object: de lezer gooit (padtabel/AC-4)', () => {
    expect(() => afgeleid({ ...nieuw(), paden: ['src/**'] })).toThrow();
  });
});

describe('padtabel/AC-6 de oude vorm van 30cc352 levert precies de lijsten van 30cc352', () => {
  test('afgeleid geeft de oude lijsten door, met kritiek = OUDE_KRITIEK plus altijdVragen (padtabel/AC-6)', () => {
    expect(afgeleid(OUD.ruw)).toEqual({
      gates: OUD.gates,
      voorReview: OUD.voorReview,
      altijdVragen: OUD.altijdVragen,
      kritiek: OUDE_VOLLEDIGE_KRITIEK,
      agentMerge: { toegestaan: OUD.toegestaan, kritiek: OUD.agentKritiek },
    });
  });

  test('loadConfig, leesConfig en leesMergeConfig lezen dezelfde lijsten, plus kritiek (padtabel/AC-6)', () => {
    expect(loadConfig(OUDE_GATES_TEKST)).toMatchObject({
      gates: OUD.gates,
      voorReview: OUD.voorReview,
      altijdVragen: OUD.altijdVragen,
      kritiek: OUDE_VOLLEDIGE_KRITIEK,
    });
    expect(leesConfig(OUDE_GATES_TEKST)).toMatchObject({ gates: OUD.gates, testpaden: OUD.testpaden });
    expect(leesMergeConfig(OUDE_GATES_TEKST)).toMatchObject({
      gates: OUD.gates,
      voorReview: OUD.voorReview,
      altijdVragen: OUD.altijdVragen,
      kritiek: OUDE_VOLLEDIGE_KRITIEK,
      agentMerge: { toegestaan: OUD.toegestaan, kritiek: OUD.agentKritiek },
    });
    expect(leesAgentMerge(OUD.ruw)).toMatchObject({ toegestaan: OUD.toegestaan, kritiek: OUD.agentKritiek });
  });

  test('oude vorm zonder voorReview en altijdVragen: ontbrekend blijft ontbrekend (padtabel/AC-6)', () => {
    const kaal = Object.fromEntries(
      Object.entries(OUD.ruw).filter(([sleutel]) => sleutel !== 'voorReview' && sleutel !== 'altijdVragen'),
    );
    const lijsten = afgeleid(kaal);
    expect(lijsten.voorReview).toBeUndefined();
    expect(lijsten.altijdVragen).toBeUndefined();
    expect(lijsten.kritiek).toEqual([...OUD.kritiek, ...OUD.gates]);
  });
});

describe('padtabel/AC-11 de oude vorm: hooks en scripts lezen hem zonder fout', () => {
  test('loadConfig, leesConfig, leesMergeConfig en afgeleid gooien niet; kritiekPad volgt OUDE_KRITIEK (padtabel/AC-11)', () => {
    expect(() => loadConfig(OUDE_GATES_TEKST)).not.toThrow();
    expect(() => leesConfig(OUDE_GATES_TEKST)).not.toThrow();
    expect(() => leesMergeConfig(OUDE_GATES_TEKST)).not.toThrow();
    const lijsten = afgeleid(OUD.ruw);
    expect(lijsten.kritiek).toEqual(OUDE_VOLLEDIGE_KRITIEK);
    expect(kritiekPad('scripts/kit/lane.mjs', loadConfig(OUDE_GATES_TEKST))).toBe(true);
  });
});

describe('padtabel/AC-12 KRITIEK staat alleen nog bevroren in padtabel.mjs', () => {
  test('OUDE_KRITIEK is gelijk aan de fixture van 30cc352 (padtabel/AC-12)', () => {
    expect(OUDE_KRITIEK).toEqual(OUD.kritiek);
  });

  test('lane.mjs bevat geen padlijst voor kritiek meer (padtabel/AC-12)', () => {
    const lane = readFileSync(path.join(REPO, 'scripts/kit/lane.mjs'), 'utf8');
    expectAbsent(
      lane,
      /\bKRITIEK\s*=|'src\/core\/api\/(?:auth|db)\/\*\*'|'rails\/hooks\/\*\*'|'check-document-status'/,
      {
        recognizes: [
          'const KRITIEK = [',
          'export const KRITIEK = [',
          "'src/core/api/auth/**',",
          "'src/core/api/db/**',",
          "'rails/hooks/**',",
          "'check-document-status',",
        ],
        allows: [
          'kritiekPad(pad, config)',
          'config.kritiek',
          "import { OUDE_KRITIEK } from '../../rails/hooks/lib/padtabel.mjs';",
        ],
      },
    );
  });

  test('alleen padtabel.mjs definieert OUDE_KRITIEK, buiten tests en docs (padtabel/AC-12)', () => {
    // Ook ongetrackte bestanden, zodat de test in de werkmap van de bouw-PR al telt; geen treffer is exit 1, geen fout.
    const definities = spawnSync(
      'git',
      ['grep', '--untracked', '-l', '-E', 'OUDE_KRITIEK\\s*=', '--', '*.mjs', '*.ts', '*.js'],
      { cwd: REPO, encoding: 'utf8' },
    )
      .stdout.split('\n')
      .filter((file) => file !== '' && !file.startsWith('test/') && !/\.(?:test|spec)\./.test(file));
    expect(definities).toEqual(['rails/hooks/lib/padtabel.mjs']);
  });
});

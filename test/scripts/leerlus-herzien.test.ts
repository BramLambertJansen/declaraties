import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { agentMerge, beoordeel, leesConfig } from '../../scripts/kit/diff-guard.mjs';
import {
  bewijsPlan,
  leerpuntMergeRedenen,
  leesLeerpuntSectie,
  leesSjabloon,
  PLEK_SCHRAPPEN,
  sluitOordeel,
  toetsBody,
} from '../../scripts/kit/leerpunt.mjs';
import { leesGesloten } from '../../scripts/kit/leerpunt-bewijs.mjs';

// Leerlus ook voor schrappen en vereenvoudigen (ADR 0081, spec leerlus-herzien AC-2 t/m AC-5).
const velden = leesSjabloon(readFileSync('.github/ISSUE_TEMPLATE/leerpunt.yml', 'utf8'));

const ONDERBOUWING =
  'Meting: 90 s → 30 s (CI-duur job x)\nOvername: check y vangt hetzelfde\nTerugval: fout z komt terug';
const WAARDEN: Record<string, string> = {
  Soort: 'Efficiëntie van de code',
  Bron: 'PR #502',
  Kosten: '3 minuten per PR',
  'Generieke reproductie': '1. verse kopie\n2. pnpm gate:fast',
  'Voorstel voor de plek': PLEK_SCHRAPPEN,
  Onderbouwing: ONDERBOUWING,
  'Template-SHA van de app': 'a'.repeat(40),
  Eerder: '_No response_',
};
const body = (waarden: Record<string, string> = WAARDEN) =>
  velden
    .map((v) => v.label)
    .filter((label) => label in waarden)
    .map((label) => `### ${label}\n\n${waarden[label] ?? ''}`)
    .join('\n\n');
const met = (extra: Record<string, string>) => body({ ...WAARDEN, ...extra });

describe('leerlus-herzien/AC-2 onderbouwing in het issue', () => {
  test.each([
    ['alle drie aanwezig', met({}), []],
    [
      'met opsommingsteken en vet',
      met({ Onderbouwing: '- **Meting:** 3 → 1 (regels)\n- Overname: x\n* Terugval: y' }),
      [],
    ],
    [
      'onbekend met reden telt als aanwezig',
      met({ Onderbouwing: ONDERBOUWING.replace('90 s', 'onbekend (cloud)') }),
      [],
    ],
    ['CRLF', met({}).replaceAll('\n', '\r\n'), []],
    ['genummerde lijst', met({ Onderbouwing: '1. Meting: 3 → 1 (regels)\n2. Overname: x\n3. Terugval: y' }), []],
    ['Meting weg', met({ Onderbouwing: 'Overname: x\nTerugval: y' }), ['onderbouwing ontbreekt: Meting']],
    [
      'Overname leeg',
      met({ Onderbouwing: 'Meting: 1 → 0 (x)\nOvername:\nTerugval: y' }),
      ['onderbouwing ontbreekt: Overname'],
    ],
    ['Terugval weg', met({ Onderbouwing: 'Meting: 1 → 0 (x)\nOvername: x' }), ['onderbouwing ontbreekt: Terugval']],
    [
      'veld leeg',
      met({ Onderbouwing: '_No response_' }),
      ['onderbouwing ontbreekt: Meting', 'onderbouwing ontbreekt: Overname', 'onderbouwing ontbreekt: Terugval'],
    ],
    [
      'vrije tekst zonder labels',
      met({ Onderbouwing: 'Deze check is traag en kan weg.' }),
      ['onderbouwing ontbreekt: Meting', 'onderbouwing ontbreekt: Overname', 'onderbouwing ontbreekt: Terugval'],
    ],
    ['andere plek met leeg veld', met({ 'Voorstel voor de plek': 'Check', Onderbouwing: '_No response_' }), []],
  ])('leerlus-herzien/AC-2: %s', (_naam, tekst, fouten) => {
    expect(toetsBody(tekst, velden)).toEqual(fouten);
  });

  test('leerlus-herzien/AC-2: andere plek zonder het veld, en het veld op de verkeerde plek', () => {
    const zonder = Object.fromEntries(Object.entries(WAARDEN).filter(([k]) => k !== 'Onderbouwing'));
    expect(toetsBody(body({ ...zonder, 'Voorstel voor de plek': 'Check' }), velden)).toEqual([]);
    const verschoven =
      met({}).replace(`### Onderbouwing\n\n${ONDERBOUWING}\n\n`, '') + `\n\n### Onderbouwing\n\n${ONDERBOUWING}`;
    expect(toetsBody(verschoven, velden)).toEqual(['volgorde: Template-SHA van de app', 'volgorde: Eerder']);
  });
});

const sectie = (...regels: string[]) => ['## Leerpunt', '', ...regels, '', '## Test'].join('\n');
const SCHRAP = `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: 90 s → 30 s (CI-duur job x)`;
const issue = (plek: string) => ({ nummer: 9, labels: ['leerpunt'], body: met({ 'Voorstel voor de plek': plek }) });
const plan = (regel: string, plek = PLEK_SCHRAPPEN) =>
  bewijsPlan({ gesloten: [issue(plek)], body: sectie(regel), diff: [] });

describe('leerlus-herzien/AC-3 meting als sluitbewijs', () => {
  test('leerlus-herzien/AC-3: de parser leest meting:', () => {
    expect(leesLeerpuntSectie(sectie(SCHRAP))).toEqual([
      { nummer: 9, trede: PLEK_SCHRAPPEN, pad: null, reden: null, meting: '90 s → 30 s (CI-duur job x)' },
    ]);
  });

  test.each([
    ['geldige meting', SCHRAP, null],
    ['met ->', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: 412 -> 120 regels (wc -l)`, null],
    ['onbekend', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: onbekend → 30 s (CI)`, /niet de vorm/],
    ['zonder bron', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: 90 s → 30 s`, /niet de vorm/],
    ['lege bron', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: 90 → 30 ( )`, /niet de vorm/],
    ['twee pijlen', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: 5 → onbekend → 3 (b)`, /niet de vorm/],
    ['zonder pijl', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs meting: 90 s (CI)`, /niet de vorm/],
    ['testpad bij deze trede', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs test/a.test.ts`, /is het bewijs "meting:/],
    ['geen test bij deze trede', `- #9: trede ${PLEK_SCHRAPPEN}; bewijs geen test: x`, /is het bewijs "meting:/],
    ['meting bij een andere trede', '- #9: trede Check; bewijs meting: 1 → 0 (x)', /hoort alleen bij trede/],
  ])('leerlus-herzien/AC-3: %s', (_naam, regel, fout) => {
    const uitslag = plan(regel);
    if (fout === null) {
      expect(uitslag.fouten).toEqual([]);
      expect(uitslag.runs).toEqual([]);
    } else expect(uitslag.fouten.join('\n')).toMatch(fout);
  });

  test('leerlus-herzien/AC-3: een issue met een andere plek kan niet via deze trede sluiten', () => {
    expect(plan(SCHRAP, 'Check').fouten).toEqual([`#9: het issue heeft een andere plek dan ${PLEK_SCHRAPPEN}`]);
    expect(
      bewijsPlan({ gesloten: [{ nummer: 9, labels: ['leerpunt'] }], body: sectie(SCHRAP), diff: [] }).fouten,
    ).toEqual([`#9: het issue heeft een andere plek dan ${PLEK_SCHRAPPEN}`]);
  });

  test('leerlus-herzien/AC-3: de voorbereidende stap neemt de issuebody mee', () => {
    const node = { number: 9, body: '### Soort', labels: { nodes: [{ name: 'leerpunt' }] } };
    const data = { data: { repository: { pullRequest: { closingIssuesReferences: { nodes: [node] } } } } };
    expect(leesGesloten(data)).toEqual([{ nummer: 9, labels: ['leerpunt'], body: '### Soort' }]);
    expect(readFileSync('scripts/kit/leerpunt-bewijs.mjs', 'utf8')).toMatch(/nodes \{ number body labels/);
  });
});

describe('leerlus-herzien/AC-4 de eigenaar merget', () => {
  test('leerlus-herzien/AC-4: meting geeft zonderTest en de merge-reden', () => {
    expect(plan(SCHRAP).zonderTest).toBe(true);
    expect(leerpuntMergeRedenen(sectie(SCHRAP))).toEqual(['leerpunt zonder test']);
  });

  test('leerlus-herzien/AC-4: diff-guard: agent-merge nee', () => {
    const tekst = readFileSync('.claude/gates.json', 'utf8');
    const config = leesConfig(tekst);
    const pr = {
      wijzigingen: [],
      json: {},
      reviews: [],
      auteur: 'x',
      headSha: 'a'.repeat(40),
      regels: 1,
      binair: [],
      bytes: 1,
      body: sectie(SCHRAP),
    };
    expect(agentMerge(pr, beoordeel(pr, config), tekst)).toMatchObject({ oordeel: 'nee' });
    expect(agentMerge(pr, beoordeel(pr, config), tekst).redenen).toContain('leerpunt zonder test: de eigenaar merget');
  });
});

describe('leerlus-herzien/AC-5 sluiten met een meting', () => {
  test('leerlus-herzien/AC-5: gemergde PR met een regel meting: is bewijs (regressie)', () => {
    expect(sluitOordeel(9, { prs: [{ merged: true, body: sectie(SCHRAP) }], comments: [] })).toBe('bewijs');
  });
});

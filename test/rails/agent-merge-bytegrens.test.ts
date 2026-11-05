import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import * as kit from '../../scripts/kit/agent-merge.mjs';
import {
  agentMergeFouten,
  agentMergeOordeel,
  leesAgentMerge,
  leesMergeConfig,
} from '../../scripts/kit/agent-merge.mjs';
import { agentMergeViolations } from '../../scripts/kit/check-docs.mjs';
import { agentMerge, beoordeel, leesConfig } from '../../scripts/kit/diff-guard.mjs';

// Bytegrens naast de regelgrens (ADR 0069 punt 3 herzien, spec agent-merge-bytegrens AC-1 tot en met AC-3). De nieuwe
// exports (`patchBytes`, `teGrootBytes`, `BYTES_ONLEESBAAR`) worden via de module opgehaald, zodat dit bestand vóór de bouw
// compileert en op een assertie faalt.
const TEKST = readFileSync('.claude/gates.json', 'utf8');
const guardConfig = leesConfig(TEKST);
const HEAD = 'a'.repeat(40);
const BLOK = { toegestaan: ['src/**'], kritiek: [], codex: true, maxRegels: 400 };

const AGENT_MERGE_ONLEESBAAR = 'agentMerge ontbreekt of is onleesbaar in .claude/gates.json';
const OMVANG_ONLEESBAAR = 'omvang van de PR niet leesbaar of agentMerge.maxRegels ontbreekt: geen agent-merge';
const BYTES_ONLEESBAAR = 'omvang van de PR niet leesbaar of agentMerge.maxBytes ontbreekt: geen agent-merge';
const teGrootBytes = (n: number, grens: number) =>
  `PR te groot voor een agent-merge: ${String(n)} bytes gewijzigd, grens ${String(grens)} (agentMerge.maxBytes)`;

function functie(naam: string): (...args: unknown[]) => unknown {
  const waarde: unknown = Reflect.get(kit, naam);
  if (typeof waarde !== 'function') throw new Error(`scripts/kit/agent-merge.mjs exporteert ${naam} niet als functie`);
  return (...args: unknown[]): unknown => {
    const resultaat: unknown = Reflect.apply(waarde, undefined, args);
    return resultaat;
  };
}

const patchBytes = (tekst: string): unknown => functie('patchBytes')(tekst);

/** De echte gates.json met een aangepast `agentMerge`-blok (velden erbij of vervangen; `undefined` haalt weg). */
function gatesMet(veranderingen: Record<string, unknown>): string {
  const ruw: unknown = JSON.parse(TEKST);
  const blok: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'agentMerge') : undefined;
  return JSON.stringify(Object.assign({}, ruw, { agentMerge: Object.assign({}, blok, veranderingen) }));
}

const MET_GRENS = gatesMet({ maxBytes: 40000 });
const src = [{ status: 'M', pad: 'src/web/x.ts' }];

describe('agent-merge-bytegrens/AC-1 leesAgentMerge en agentMergeFouten lezen maxBytes', () => {
  test('agent-merge-bytegrens/AC-1: maxBytes 40000 wordt gelezen', () => {
    expect(leesAgentMerge({ agentMerge: { ...BLOK, maxBytes: 40000 } })).toEqual({ ...BLOK, maxBytes: 40000 });
  });

  test.each([[undefined], [0], [-1], [40000.5], ['40000'], [null]])(
    'agent-merge-bytegrens/AC-1: maxBytes %j geeft null en de bytes-melding',
    (maxBytes) => {
      const ruw = { agentMerge: { ...BLOK, maxBytes } };
      expect(leesAgentMerge(ruw)).toBeNull();
      expect(agentMergeFouten(ruw)).toEqual([BYTES_ONLEESBAAR]);
    },
  );

  test('agent-merge-bytegrens/AC-1: een ongeldige maxRegels houdt de bestaande melding, naast een geldige maxBytes', () => {
    const ruw = { agentMerge: { ...BLOK, maxRegels: 0, maxBytes: 40000 } };
    expect(leesAgentMerge(ruw)).toBeNull();
    expect(agentMergeFouten(ruw)).toEqual([OMVANG_ONLEESBAAR]);
  });

  test('agent-merge-bytegrens/AC-1: geen blok: drie meldingen, in vaste volgorde', () => {
    expect(agentMergeFouten({})).toEqual([AGENT_MERGE_ONLEESBAAR, OMVANG_ONLEESBAAR, BYTES_ONLEESBAAR]);
  });

  test('agent-merge-bytegrens/AC-1: de meldingsconstante is letterlijk die uit de spec', () => {
    expect(Reflect.get(kit, 'BYTES_ONLEESBAAR')).toBe(BYTES_ONLEESBAAR);
    expect(functie('teGrootBytes')(40001, 40000)).toBe(teGrootBytes(40001, 40000));
  });

  test('agent-merge-bytegrens/AC-1: de echte gates.json heeft "maxBytes": 40000', () => {
    expect(TEKST).toMatch(/"maxBytes": 40000\b/);
    expect(leesMergeConfig(TEKST).agentMerge).toMatchObject({ maxRegels: 400, maxBytes: 40000 });
  });

  test('agent-merge-bytegrens/AC-1: een app zonder maxBytes valt dicht in de diff-guard', () => {
    const zonder = gatesMet({ maxBytes: undefined });
    const p = { wijzigingen: src, json: {}, reviews: [], auteur: 'x', headSha: HEAD, regels: 1, binair: [], bytes: 1 };
    expect(agentMerge(p, beoordeel(p, guardConfig), zonder)).toEqual({
      oordeel: 'nee',
      redenen: [AGENT_MERGE_ONLEESBAAR],
    });
  });

  test.each([
    ['ontbrekend', undefined, 'afwezig'],
    ['"40000"', '40000', '"40000"'],
    ['0', 0, '0'],
    ['40000.5', 40000.5, '40000.5'],
  ])('agent-merge-bytegrens/AC-1: check-docs weigert maxBytes %s op het ruwe blok', (_naam, maxBytes, getoond) => {
    const fouten = agentMergeViolations([], gatesMet({ maxBytes }));
    expect(fouten).toContainEqual({
      key: 'docs:agentMerge.maxBytes',
      message: `.claude/gates.json: agentMerge.maxBytes is ${getoond}, geen geheel getal ≥ 1`,
    });
  });

  test('agent-merge-bytegrens/AC-1: check-docs aanvaardt maxBytes 40000', () => {
    expect(agentMergeViolations([], MET_GRENS).map((v) => v.key)).not.toContain('docs:agentMerge.maxBytes');
  });

  test('agent-merge-bytegrens/AC-1: de CHANGELOG noemt agentMerge.maxBytes voor apps', () => {
    const changelog = readFileSync('CHANGELOG.md', 'utf8');
    const start = changelog.indexOf('## [Unreleased]');
    const einde = changelog.indexOf('\n## [', start + 1);
    const open = changelog.slice(start, einde === -1 ? undefined : einde);
    const alinea = open.split('\n\n').find((deel) => deel.includes('agentMerge.maxBytes')) ?? '';
    // In een app-kopie vervangt `app:init` (renameChangelog) de hele Unreleased-sectie door de startregel.
    const template = readFileSync('package.json', 'utf8').includes('"name": "app-template"');
    const [tekst, patronen] = template
      ? [alinea, [/agentMerge\.maxBytes/, /\bapps?\b/]]
      : [open, [/^- Gestart vanaf template \S+\.$/m]];
    for (const patroon of patronen) expect(tekst).toMatch(patroon);
  });
});

describe('agent-merge-bytegrens/AC-2 patchBytes telt de bytes van een hunk-tekst', () => {
  const regels = (n: number, lengte: number) => Array.from({ length: n }, () => `+${'x'.repeat(lengte)}`).join('\n');

  test.each([
    ['400 regels van 100 bytes', regels(400, 100), 40000],
    ['400 regels van 100 bytes plus één byte', `${regels(400, 100)}\n+y`, 40001],
    ['één regel van 40.001 bytes', `+${'x'.repeat(40001)}`, 40001],
    ['é telt als 2 bytes', '+é', 2],
    ['CRLF: de \\r telt mee', '-a\r\n+bc\r', 5],
    ['\\ No newline telt niet', '-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file', 2],
    ['@@-regels en context tellen niet', '@@ -1,2 +1,2 @@ functie\n een\n-twee\n+drie', 8],
    ['een toegevoegde regel ++x telt volledig', '++x', 2],
    ['een verwijderde regel --- telt volledig', '---', 2],
    ['een verwijderde regel -- sql telt volledig', '-- sql', 5],
    ['een lege tekst', '', 0],
    ['een lege toegevoegde regel', '+\n+', 0],
  ])('agent-merge-bytegrens/AC-2: %s', (_naam, tekst, verwacht) => {
    expect(patchBytes(tekst)).toBe(verwacht);
  });
});

describe('agent-merge-bytegrens/AC-3 agentMergeOordeel op bytes', () => {
  const invoer = (bytes: unknown) => ({
    wijzigingen: src,
    json: {},
    geraakteJson: [],
    risico: {},
    regels: 1,
    binair: [],
    bytes,
  });

  test.each([
    [39999, 'ja'],
    [40000, 'ja'],
    [0, 'ja'],
  ])('agent-merge-bytegrens/AC-3: %i bytes bij grens 40000: %s', (bytes, verwacht) => {
    const i = invoer(bytes);
    expect(agentMergeOordeel(i, leesMergeConfig(MET_GRENS))).toEqual({ oordeel: verwacht, redenen: [] });
  });

  test('agent-merge-bytegrens/AC-3: 40001 bytes bij grens 40000: nee met de bytes-reden', () => {
    const i = invoer(40001);
    expect(agentMergeOordeel(i, leesMergeConfig(MET_GRENS))).toEqual({
      oordeel: 'nee',
      redenen: [teGrootBytes(40001, 40000)],
    });
  });

  test.each([
    ['ontbreekt', undefined],
    ['is negatief', -1],
    ['is een breuk', 1.5],
    ['is tekst', '3'],
    ['is null', null],
  ])('agent-merge-bytegrens/AC-3: bytes %s: nee met de onleesbaar-melding', (_naam, bytes) => {
    const i = invoer(bytes);
    expect(agentMergeOordeel(i, leesMergeConfig(MET_GRENS))).toEqual({ oordeel: 'nee', redenen: [BYTES_ONLEESBAAR] });
  });

  test('agent-merge-bytegrens/AC-3: de diff-guard geeft pr.bytes door aan het oordeel', () => {
    const basis = { wijzigingen: src, json: {}, reviews: [], auteur: 'x', headSha: HEAD, regels: 1, binair: [] };
    const binnen = { ...basis, bytes: 40000 };
    const erover = { ...basis, bytes: 40001 };
    expect(agentMerge(binnen, beoordeel(binnen, guardConfig), MET_GRENS)).toEqual({ oordeel: 'ja', redenen: [] });
    expect(agentMerge(erover, beoordeel(erover, guardConfig), MET_GRENS)).toEqual({
      oordeel: 'nee',
      redenen: [teGrootBytes(40001, 40000)],
    });
    expect(agentMerge(basis, beoordeel(basis, guardConfig), MET_GRENS)).toEqual({
      oordeel: 'nee',
      redenen: [BYTES_ONLEESBAAR],
    });
  });

  test('agent-merge-bytegrens/AC-3: weinig regels maar te veel bytes is nee, ook onder de regelgrens', () => {
    const i = { ...invoer(50000), regels: 1 };
    expect(agentMergeOordeel(i, leesMergeConfig(MET_GRENS)).redenen).toEqual([teGrootBytes(50000, 40000)]);
  });
});

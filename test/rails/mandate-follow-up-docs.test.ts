import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { exportVan } from '../hooks/follow-up-kit';

// mandate-follow-up/AC-14 en AC-26: de letterlijke teksten uit docs/specs/taakmandaat-vervolg.md ("Nieuwe documentatieteksten",
// OV-8 en OV-10) staan in de documenten. Vergelijking na samenvoegen van witruimte en weghalen van blockquote-tekens, zodat een
// regeleinde of `> ` het verschil niet maakt. `pnpm ratchet` en `pnpm format:check` (AC-14, AC-26) blijven aparte checks.
const ROOT = path.join(import.meta.dirname, '../..');
const GATES_MODULE = ['../../scripts/kit', 'gates.mjs'].join('/');

// GEWIJZIGD (compacte-kennisbasis-rails/AC-10, eigenaarbesluit 2026-10-30, ADR 0053 en 0063): een ADR dat naar `docs/adr/archief/`
// verhuist (byte-gelijk) staat niet meer op zijn oude pad; een ADR-pad valt terug op het archief.
function leesPad(bestand: string): string {
  const pad = path.join(ROOT, bestand);
  const archief = path.join(ROOT, bestand.replace(/^docs\/adr\//, 'docs/adr/archief/'));
  return bestand.startsWith('docs/adr/') && !existsSync(pad) && existsSync(archief) ? archief : pad;
}

function tekstVan(bestand: string): string {
  return readFileSync(leesPad(bestand), 'utf8')
    .split('\n')
    .map((regel) => regel.replace(/^\s*>\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
}

function samen(tekst: string): string {
  return tekst.replace(/\s+/g, ' ').trim();
}

// GEWIJZIGD (compacte-kennisbasis-rails/AC-14, PR 6b): de zin over het taakmandaat in docs/dod.md (regel 10) en in framework
// R-WERK-16 is vervallen met het mandaat; de pin op de volledige tekst is een afwezigheidstest op die zin geworden.
const DOD =
  'Binnen een taakmandaat wijzigt in `docs/roadmap.md` alleen het vinkje van het item dat de spec van het mandaat tussen backticks noemt (precies één open item per spec);';

const FRAMEWORK =
  'Binnen een taakmandaat mag `docs/roadmap.md` alleen het vinkje van het item van de taak meewijzigen; de precieze regel staat in `docs/dod.md`.';

// GEWIJZIGD (spec-en-bouw/AC-8, ADR 0062): het statuscommentaar noemt beide vormen van `gebouwd`.
const TEMPLATE =
  'gebouwd: # #<deze PR> in de PR met de implementatie (ADR 0062), of # #<PR>; gevalideerd: <sha> (pnpm docs:status)';

const GATE =
  'een nieuw of gewijzigd [x] in docs/roadmap.md verwijst naar bewijs (testpad, checknaam of PR-nummer) en een spec die naar gebouwd gaat heeft status: gebouwd # #<PR>; gevalideerd: <sha>, t.o.v. origin/main (framework §8); heeft docs/roadmap.md een kop ## Nu, dan gelden ook de structuurregels: vereiste koppen, hooguit 3 open items onder Nu, terug als: bij geparkeerd, geen gedateerd statusproza en aanleiding: bij een nieuw open item (ADR 0046)';

const DOORLOOP_VOORBEELD = 'pnpm docs:status docs/specs/voorbeeld.md gebouwd --pr 123 --roadmap';
const DOORLOOP_ZIN =
  'Schrijft alleen de statusregel met PR en gevalideerde bron-SHA, en met `--roadmap` het vinkje van het item dat de spec noemt.';
const DOORLOOP_REGEL81 = 'als de latere diff uitsluitend statusregels en het vinkje van de eigen taak wijzigt';

const NOTITIE = `Deels vervallen door [taakmandaat-vervolg](taakmandaat-vervolg.md) (B2): roadmap/AC-10 voor zover vrij commentaar achter \`status: gebouwd\` als bewijs telt, en de route "vink het roadmap-item af" als vervanging van statusbewijs. De enige vorm is nu \`status: gebouwd # #<PR>; gevalideerd: <sha>\`.`;

const ADR_0027 =
  'Daarna mogen uitsluitend statusregels en het vinkje van het roadmap-item van de eigen spec veranderen (spec taakmandaat-vervolg);';
const MANDAAT_37 =
  '`pnpm docs:status` wijzigt alleen de statusregel, met `--roadmap` ook het vinkje van de eigen taak;';
const MANDAAT_AC9 = 'uitsluitend latere statuswijzigingen en het vinkje van het roadmap-item van de eigen spec';

describe('mandate-follow-up/AC-14: nieuwe documentatieteksten', () => {
  test.each([
    ['docs/dod.md (regel 10)', 'docs/dod.md', DOD],
    ['docs/framework.md §8', 'docs/framework.md', FRAMEWORK],
  ])('AC-14 (PR 6b): %s bevat de mandaatzin niet meer', (_naam, bestand, tekst) => {
    expect(tekstVan(bestand).includes(samen(tekst)), `${bestand} bevat nog: ${samen(tekst)}`).toBe(false);
  });

  test.each([
    ['docs/specs/_template.md (regel 2)', 'docs/specs/_template.md', TEMPLATE],
    ['docs/operations/agent-doorloop.md: voorbeeldopdracht', 'docs/operations/agent-doorloop.md', DOORLOOP_VOORBEELD],
    ['docs/operations/agent-doorloop.md: beschrijving', 'docs/operations/agent-doorloop.md', DOORLOOP_ZIN],
  ])('%s', (_naam, bestand, tekst) => {
    expect(tekstVan(bestand).includes(samen(tekst)), `${bestand} bevat niet: ${samen(tekst)}`).toBe(true);
  });

  test('de beschrijving van check:roadmap in scripts/kit/gates.mjs (ook in feiten.mjs)', async () => {
    const gates: unknown = await exportVan(GATES_MODULE, 'gates');
    if (!Array.isArray(gates)) throw new Error('gates is geen lijst');
    const lijst: unknown[] = gates;
    const gate = lijst.find(
      (item) => typeof item === 'object' && item !== null && Reflect.get(item, 'script') === 'check:roadmap',
    );
    expect(typeof gate === 'object' && gate !== null ? Reflect.get(gate, 'bewaakt') : undefined).toBe(GATE);
  });
});

describe('mandate-follow-up/AC-26: de OV-8- en OV-10-teksten in de implementatie-PR', () => {
  test('roadmap-vinkjes.md: de notitie direct onder de titel', () => {
    const regels = readFileSync(path.join(ROOT, 'docs/specs/roadmap-vinkjes.md'), 'utf8').split('\n');
    const titel = regels.findIndex((regel) => regel.startsWith('# '));
    const onderTitel = samen(
      regels
        .slice(titel + 1, titel + 8)
        .map((regel) => regel.replace(/^>\s?/, ''))
        .join(' '),
    );
    expect(onderTitel.startsWith(samen(NOTITIE))).toBe(true);
  });

  test.each([
    ['docs/adr/0027-taakmandaat-voor-frameworkwerk.md', ADR_0027],
    ['docs/specs/taakmandaat-frameworkwerk.md', MANDAAT_37],
    ['docs/specs/taakmandaat-frameworkwerk.md', MANDAAT_AC9],
    ['docs/operations/agent-doorloop.md', DOORLOOP_REGEL81],
  ])('%s bevat de versoepelde tekst', (bestand, tekst) => {
    expect(tekstVan(bestand).includes(samen(tekst)), `${bestand} bevat niet: ${samen(tekst)}`).toBe(true);
  });
});

// compacte-kennisbasis-rails/AC-14 (PR 6b): het taakmandaat bestaat niet meer; geen document, agentinstructie of skill noemt het.
describe('compacte-kennisbasis-rails/AC-14: de mandaatwoorden zijn uit de documenten', () => {
  const BESTANDEN = [
    'docs/dod.md',
    'docs/framework.md',
    'AGENTS.md',
    '.claude/rules/core.md',
    '.claude/agents/developer.md',
    '.claude/skills/spec/SKILL.md',
    '.claude/skills/opleveren/SKILL.md',
    'docs/operations/agent-doorloop.md',
  ];
  const WOORDEN = ['taakmandaat', 'broncodemandaat', 'docs:decision'];
  const gevallen = BESTANDEN.flatMap((bestand) => WOORDEN.map((woord) => ({ bestand, woord })));

  test.each(gevallen)('$bestand bevat "$woord" niet meer (hoofdletterongevoelig)', ({ bestand, woord }) => {
    const tekst = readFileSync(path.join(ROOT, bestand), 'utf8').toLowerCase();
    expect(tekst.includes(woord), bestand + ' noemt nog ' + woord).toBe(false);
  });
});

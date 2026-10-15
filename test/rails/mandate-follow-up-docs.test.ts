import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { exportVan } from '../hooks/follow-up-kit';

// mandate-follow-up/AC-14 en AC-26: de letterlijke teksten uit docs/specs/taakmandaat-vervolg.md ("Nieuwe documentatieteksten",
// OV-8 en OV-10) staan in de documenten. Vergelijking na samenvoegen van witruimte en weghalen van blockquote-tekens, zodat een
// regeleinde of `> ` het verschil niet maakt. `pnpm ratchet` en `pnpm format:check` (AC-14, AC-26) blijven aparte checks.
const ROOT = path.join(import.meta.dirname, '../..');
const GATES_MODULE = ['../../scripts/kit', 'gates.mjs'].join('/');

function tekstVan(bestand: string): string {
  return readFileSync(path.join(ROOT, bestand), 'utf8')
    .split('\n')
    .map((regel) => regel.replace(/^\s*>\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
}

function samen(tekst: string): string {
  return tekst.replace(/\s+/g, ' ').trim();
}

const DOD =
  'Is het bewijs voor een roadmap-item beschikbaar (checkuitslag of test, eventueel met PR-nummer), dan vinkt dezelfde PR dat item af, met een verwijzing achter het vinkje (testpad, checknaam of PR-nummer; de uitslag staat in de PR) en met akkoord van de eigenaar. Een spec naar `gebouwd` heeft één vorm, die `pnpm docs:status` schrijft: `status: gebouwd # #<PR>; gevalideerd: <sha>`; een afgevinkt roadmap-item vervangt die niet. Binnen een taakmandaat wijzigt in `docs/roadmap.md` alleen het vinkje van het item dat de spec van het mandaat tussen backticks noemt (precies één open item per spec); `pnpm docs:status <spec> gebouwd --pr <nummer> --roadmap` zet status en vinkje samen (ADR 0027). Een item dat deze PR afrondt maar open blijft, is een bevinding van de reviewer, net als een vinkje zonder bewijs. `pnpm check:roadmap` (in `gate:fast`) en `check-document-status` (CI) lezen beide vormen met dezelfde code; of het juiste item is afgevinkt blijft een oordeel van de reviewer.';

const FRAMEWORK =
  'Binnen een taakmandaat mag `docs/roadmap.md` alleen het vinkje van het item van de taak meewijzigen; de precieze regel staat in `docs/dod.md`.';

const TEMPLATE = 'gebouwd: # #<PR>; gevalideerd: <sha> (pnpm docs:status)';

const GATE =
  'een nieuw of gewijzigd [x] in docs/roadmap.md verwijst naar bewijs (testpad, checknaam of PR-nummer) en een spec die naar gebouwd gaat heeft status: gebouwd # #<PR>; gevalideerd: <sha>, t.o.v. origin/main (framework §8); heeft docs/roadmap.md een kop ## Nu, dan gelden ook de structuurregels: vereiste koppen, hooguit 3 open items onder Nu, terug als: bij geparkeerd, geen gedateerd statusproza en aanleiding: bij een nieuw open item (ADR 0029)';

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

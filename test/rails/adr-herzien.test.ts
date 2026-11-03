import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { adrHerzienViolations, clausules, herzieningsPunten, kop } from '../../scripts/kit/adr-herzien.mjs';
import { docsKrimp, docsViolations } from '../../scripts/kit/check-docs.mjs';

// Spec adr-herzien-markering (namespace adr-herzien), ADR 0074: een geaccepteerd ADR B dat in zijn kop een geaccepteerd
// ADR A wijzigt (`Wijzigt`, `Herziet`, `Vervangt`), staat in A als herzieningsregel met B en de genoemde punten.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const lines = (...regels: string[]): string => regels.join('\n');

// ---------------------------------------------------------------------------------------------------------------------
// kop
// ---------------------------------------------------------------------------------------------------------------------

describe('kop', () => {
  test('adr-herzien/AC-1: de kop is alles vóór de eerste `## `-kop', () => {
    const tekst = lines(
      '# 0020 — B',
      '',
      'Status: geaccepteerd',
      '',
      'Wijzigt [0010](0010-a.md) punt 1.',
      '',
      '## Context',
      '',
      'Wijzigt [0011](0011-c.md) punt 2.',
    );

    expect(kop(tekst)).toContain('Wijzigt [0010](0010-a.md) punt 1.');
    expect(kop(tekst)).not.toContain('## Context');
    expect(kop(tekst)).not.toContain('0011');
  });

  test('adr-herzien/AC-1: de kop eindigt ook bij een andere `## `-kop dan Context (0057, 0058: `## Aanleiding`)', () => {
    const tekst = lines(
      '# 0058 — B',
      '',
      'Status: geaccepteerd',
      '',
      'Wijzigt [0010](0010-a.md) punt 1.',
      '',
      '## Aanleiding',
      'Wijzigt [0011](0011-c.md).',
    );

    expect(clausules(kop(tekst))).toStrictEqual([{ doel: '0010-a.md', punten: [1] }]);
  });

  test('adr-herzien/AC-1: een `###`-kop beëindigt de kop niet, alleen `## `', () => {
    const tekst = lines('# 0020 — B', '', '### Tussenkop', '', 'Wijzigt [0010](0010-a.md) punt 1.', '', '## Context');

    expect(kop(tekst)).toContain('Wijzigt [0010](0010-a.md) punt 1.');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// clausules: de echte koppen (AC-2, AC-3)
// ---------------------------------------------------------------------------------------------------------------------

const KOP_0054 = lines(
  '# 0054 — `gebouwd` in de bouw-PR, bewezen door de merge',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-11-03 (#469): gewijzigd door [0057](0057-risicogestuurde-werkstraat.md) (de activering)',
  '',
  'Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 10, en punt 5 en 6 waar ze `gebouwd` noemen.',
  'Drempel: A4 (een punt van een geaccepteerd ADR vervangen) en A3 (de guard aanvaardt `gebouwd` zonder eigen checkcontrole).',
  '',
);

const KOP_0056 = lines(
  '# 0056 — Functionele UI-wijzigingen in één PR',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-10-30 (#385): in punt 5 vervalt de zin over het broncodemandaat, dat met',
  '[0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) vervalt.',
  'Herzien: 2026-11-03 (#469): gewijzigd door [0058](0058-beperkte-fixroute-en-volledige-featurestraat.md) (de',
  'mini-specplicht, alleen voor de lichte route)',
  '',
  'Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 8–9 en 12–15 voor functionele UI-wijzigingen in de template.',
  'Drempel: A3 (de bestaande lane-uitsluiting en het voorafgaande broncodemandaat versoepelen) en A4 (0046 wijzigen).',
  '',
);

const KOP_0058 = lines(
  '# 0058 — Beperkte fixroute en volledige featurestraat',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-10-30 (#385): in punt 6 vervalt "broncodemandaat"',
  '([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).',
  '',
  'Wijzigt [0057](0057-risicogestuurde-werkstraat.md) punt 1 en 4 en de mini-specplicht uit',
  '[0056](0056-functionele-ui-in-een-pr.md) voor uitsluitend de lichte route hieronder.',
  'Drempel: A3 (review zonder verplichte technische rolscheiding bij beperkte fixes), A4 (bestaande werkstraatafspraken).',
  'De status is de bedoelde acceptatie in dit voorstel; alleen de eigenaar maakt het besluit met zijn merge geldend.',
  '',
);

const KOP_0062 = lines(
  '# 0062 — Spec en bouw in één PR',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-10-30 (#379): punt 4 geldt ook na de merge; voor een gemergde PR vervalt "de PR open is" uit 0046 punt 10 en',
  'volgt het bouwbewijs uit de mergecommit ([spec](../specs/gebouwd-na-merge.md)).',
  'Herzien: 2026-10-30 (#385): in punt 2 vervallen "gate-label" en "of mandaat"',
  '([0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md)).',
  '',
  'Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 5, 10, 12, 14 en 15. Drempel: A3 (de lanetoets in',
  '`check-document-status` laat meer toe) en A4 (afspraken uit een geaccepteerd ADR). De status is de bedoelde acceptatie in dit',
  'voorstel; alleen de eigenaar maakt het besluit met zijn merge geldend. Uitwerking: [spec](../specs/spec-en-bouw-in-een-pr.md).',
  '',
);

const KOP_0069 = lines(
  '# 0069 — De hoofdsessie merget niet-kritiek werk zelf',
  '',
  'Status: geaccepteerd',
  'Herzien: 2026-11-03 (#456): punt 3 (Codex-voorwaarde drieledig, omvanggrens `agentMerge.maxRegels`), punt 5',
  '(steekproef, terugval, overgang), Gevolgen en Meten; versoepelt de Codex-voorwaarde; uitwerking in',
  '[spec](../specs/agent-merge-zonder-codex.md)',
  'Herzien: 2026-11-03 (#468): punt 3 (een 👀 van Codex of een review die nog bezig is, telt als spoor en houdt de merge tegen),',
  'punt 5 (overgang) en Gevolgen; verscherpt de Codex-voorwaarde; uitwerking in [spec](../specs/agent-merge-codex-wachten.md)',
  'Herzien: 2026-11-03 (#473): punt 3, bytegrens `agentMerge.maxBytes` naast `maxRegels`; verscherpt de omvanggrens;',
  'uitwerking in [spec](../specs/agent-merge-bytegrens.md)',
  '',
  'Wijzigt [0046](0046-werkstraat-en-beslisroute.md) punt 30, 31, 33, 34 en 35, de zin "automatische agent-merges vallen af" uit',
  '[0057](0057-risicogestuurde-werkstraat.md), in [0064](0064-leesbudget-per-laag.md) "zodra de GitHub App er is" (R-DOC-09) en in',
  '[0068](0068-samenhang-checks-en-rollen.md) punt 3 de eigenaarmerge als grens (voor agent-merges is de grens het vangnet van punt',
  '3 en 4 hieronder); vult [0062](0062-spec-en-bouw-in-een-pr.md) aan. Drempel: A3 (rechten verruimen). Uitwerking:',
  '[spec](../specs/agent-merge-niet-kritiek.md).',
  '',
);

const KOP_0071 = lines(
  '# 0071 — Rolhek vooraf alleen voor wat de toets op effect niet ziet',
  '',
  'Status: geaccepteerd',
  '',
  'Wijzigt [0066](0066-schrijfgrens-op-effect.md) punt 3 ("de toets vooraf blijft"), de buitenscope "de hoofdsessie als dader"',
  'van spec rolhek-effect (OV-1) en in spec rolhek-lezen AC-2 en AC-5 het `--output`-verbod (voortaan op effect); vult',
  '[0045](0045-railwerk.md) aan. Drempel: A3 (een check vooraf vervalt; de controle verschuift naar achteraf) en A4. Uitwerking:',
  '[spec](../specs/rolhek-vooraf-krimp.md).',
  '',
);

describe('clausules: echte koppen', () => {
  test.each<[string, string, { doel: string; punten: number[] }[]]>([
    [
      '0054 (herhaald punt: `punt 10, en punt 5 en 6`; herzieningsregel telt niet)',
      KOP_0054,
      [{ doel: '0046-werkstraat-en-beslisroute.md', punten: [10, 5, 6] }],
    ],
    [
      '0056 (bereiken met en-dash: `8–9 en 12–15`)',
      KOP_0056,
      [{ doel: '0046-werkstraat-en-beslisroute.md', punten: [8, 9, 12, 13, 14, 15] }],
    ],
    [
      '0058 (twee doelen in één clausule over een regeleinde; tweede zonder punten)',
      KOP_0058,
      [
        { doel: '0057-risicogestuurde-werkstraat.md', punten: [1, 4] },
        { doel: '0056-functionele-ui-in-een-pr.md', punten: [] },
      ],
    ],
    [
      '0062 (lijst met komma en `en`, zinseinde direct na het laatste nummer)',
      KOP_0062,
      [{ doel: '0046-werkstraat-en-beslisroute.md', punten: [5, 10, 12, 14, 15] }],
    ],
    [
      '0069 (vier doelen tot de puntkomma; `vult [0062] aan` telt niet; `punt 3 en 4` niet direct na een link)',
      KOP_0069,
      [
        { doel: '0046-werkstraat-en-beslisroute.md', punten: [30, 31, 33, 34, 35] },
        { doel: '0057-risicogestuurde-werkstraat.md', punten: [] },
        { doel: '0064-leesbudget-per-laag.md', punten: [] },
        { doel: '0068-samenhang-checks-en-rollen.md', punten: [3] },
      ],
    ],
    [
      '0071 (backticks in de clausule; een spec zonder link is geen doel; `vult [0045] aan` telt niet)',
      KOP_0071,
      [{ doel: '0066-schrijfgrens-op-effect.md', punten: [3] }],
    ],
  ])('adr-herzien/AC-2 en AC-3: %s', (_naam, kopTekst, verwacht) => {
    expect(clausules(kopTekst)).toStrictEqual(verwacht);
  });

  test('adr-herzien/AC-1: de echte koppen komen ongewijzigd uit de bestanden (kop() van het echte ADR)', () => {
    const echt = (bestand: string): string => kop(readFileSync(path.join(ROOT, 'docs/adr', bestand), 'utf8'));

    expect(clausules(echt('0054-gebouwd-in-de-bouw-pr.md'))).toStrictEqual(clausules(KOP_0054));
    expect(clausules(echt('0071-rolhek-vooraf-vaste-lijst.md'))).toStrictEqual(clausules(KOP_0071));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// clausules: vormen (AC-2) en grenzen van de clausule (AC-3)
// ---------------------------------------------------------------------------------------------------------------------

const k = (zin: string): string => lines('# 0020 — B', '', 'Status: geaccepteerd', '', zin, '');

describe('clausules: puntvormen', () => {
  test.each<[string, string, number[]]>([
    ['één punt', 'Wijzigt [0010](0010-a.md) punt 4.', [4]],
    ['lijst met komma en en', 'Wijzigt [0010](0010-a.md) punt 1, 3 en 7.', [1, 3, 7]],
    ['bereik met en-dash', 'Wijzigt [0010](0010-a.md) punt 2–4.', [2, 3, 4]],
    ['bereik met koppelteken', 'Wijzigt [0010](0010-a.md) punt 2-4.', [2, 3, 4]],
    ['bereik en lijst gemengd', 'Wijzigt [0010](0010-a.md) punt 1, 5-6 en 9.', [1, 5, 6, 9]],
    ['herhaald punt', 'Wijzigt [0010](0010-a.md) punt 10, en punt 5 en 6.', [10, 5, 6]],
    ['reeks eindigt bij het eerste andere woord', 'Wijzigt [0010](0010-a.md) punt 2 en 3 waar 8 staat.', [2, 3]],
    ['geen reeks direct na de link', 'Wijzigt [0010](0010-a.md) in punt 2.', []],
    ['geen punten', 'Wijzigt [0010](0010-a.md).', []],
  ])('adr-herzien/AC-2: %s', (_naam, zin, punten) => {
    expect(clausules(k(zin))).toStrictEqual([{ doel: '0010-a.md', punten }]);
  });

  test.each(['Wijzigt', 'Herziet', 'Vervangt'])('adr-herzien/AC-3: een clausule begint met %s', (woord) => {
    expect(clausules(k(`${woord} [0010](0010-a.md) punt 1.`))).toStrictEqual([{ doel: '0010-a.md', punten: [1] }]);
  });
});

describe('clausules: grenzen', () => {
  test('adr-herzien/AC-3: basis — beide links in één clausule tellen', () => {
    expect(clausules(k('Wijzigt [0010](0010-a.md) punt 1 en [0011](0011-b.md) punt 2.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
      { doel: '0011-b.md', punten: [2] },
    ]);
  });

  test('adr-herzien/AC-3: de clausule eindigt bij de eerste puntkomma', () => {
    expect(clausules(k('Wijzigt [0010](0010-a.md) punt 1; zie ook [0011](0011-b.md) punt 2.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
    ]);
  });

  test('adr-herzien/AC-3: de clausule eindigt bij het eerste zinseinde', () => {
    expect(clausules(k('Wijzigt [0010](0010-a.md) punt 1. Zie ook [0011](0011-b.md) punt 2.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
    ]);
  });

  test('adr-herzien/AC-3: zinseinde aan het einde van de tekst sluit de clausule af', () => {
    expect(clausules('Wijzigt [0010](0010-a.md) punt 1.')).toStrictEqual([{ doel: '0010-a.md', punten: [1] }]);
  });

  test('adr-herzien/AC-3: de punt in `.md` van een link breekt de clausule niet', () => {
    expect(clausules(k('Wijzigt [0010](0010-a.md), [0011](0011-b.md) punt 2.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [] },
      { doel: '0011-b.md', punten: [2] },
    ]);
  });

  test('adr-herzien/AC-3: een punt of puntkomma in backticks breekt de clausule niet', () => {
    expect(
      clausules(k('Wijzigt de regel `a. b; c` uit [0010](0010-a.md) punt 3 en `x.y` in [0011](0011-b.md) punt 4.')),
    ).toStrictEqual([
      { doel: '0010-a.md', punten: [3] },
      { doel: '0011-b.md', punten: [4] },
    ]);
  });

  test('adr-herzien/AC-3: een punt zonder witruimte erna (zoals `agentMerge.maxRegels`) is geen zinseinde', () => {
    expect(clausules(k('Wijzigt agentMerge.maxRegels in [0010](0010-a.md) punt 3.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [3] },
    ]);
  });

  test('adr-herzien/AC-3: `vult [A] aan` buiten de clausule telt niet', () => {
    expect(clausules(k('Wijzigt [0010](0010-a.md) punt 1; vult [0011](0011-b.md) punt 2 aan.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
    ]);
  });

  test('adr-herzien/AC-3: een kop met alleen `Vult [A] aan` heeft geen clausule', () => {
    expect(clausules(k('Vult [0011](0011-b.md) punt 2 aan.'))).toStrictEqual([]);
  });

  test('adr-herzien/AC-3: een link in een andere zin vóór de clausule telt niet', () => {
    expect(clausules(k('Volgt op [0011](0011-b.md). Wijzigt [0010](0010-a.md) punt 1.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
    ]);
  });

  test('adr-herzien/AC-3: een link naar een spec of ander bestand is geen doel', () => {
    expect(clausules(k('Wijzigt [spec](../specs/x.md) en [0010](0010-a.md) punt 1.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
    ]);
  });

  test('adr-herzien/AC-3: een herzieningsregel met `gewijzigd door [B]` of `Wijzigt` is geen clausule', () => {
    const tekst = lines(
      '# 0010 — A',
      '',
      'Status: geaccepteerd',
      '',
      'Herzien: 2026-11-03 (#1): Wijzigt [0011](0011-b.md) punt 2',
      '',
    );

    expect(clausules(tekst)).toStrictEqual([]);
  });

  test('adr-herzien/AC-2: twee clausules met hetzelfde doel geven elk een ingang', () => {
    expect(clausules(k('Wijzigt [0010](0010-a.md) punt 1. Herziet [0010](0010-a.md) punt 4.'))).toStrictEqual([
      { doel: '0010-a.md', punten: [1] },
      { doel: '0010-a.md', punten: [4] },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// herzieningsPunten: de bestaande regels in 0063, 0064, 0066 (en 0054, 0056)
// ---------------------------------------------------------------------------------------------------------------------

const KOP_0063 = lines(
  '# 0063 — Compacte kennisbasis en lichtere werkstraat',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-11-02 (#416): punt 3 en 7 volgen [0064](0064-leesbudget-per-laag.md)',
  'Herzien: 2026-11-02 (#418): punt 3 volgt [0065](0065-grenzen-als-meting.md)',
  '',
  'Herziet in dezelfde PR [0045](0045-railwerk.md), [0046](0046-werkstraat-en-beslisroute.md),',
  '[0052](0052-accountstatus-en-laatste-login.md), [0053](0053-adr-archief.md), [0056](0056-functionele-ui-in-een-pr.md),',
  '[0057](0057-risicogestuurde-werkstraat.md), [0058](0058-beperkte-fixroute-en-volledige-featurestraat.md) en',
  '[0062](0062-spec-en-bouw-in-een-pr.md): alleen de zinsdelen over taakmandaat en gate-label vallen weg. 0055 vervalt.',
  'Drempel: A3 (mandaat en label vervallen) en A4. Uitwerking rails: [spec](../specs/compacte-kennisbasis-rails.md).',
  '',
);

const KOP_0064 = lines(
  '# 0064 — Leesbudget per laag en minder wrijving',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-11-02 (#418): punt 1 en 3 volgen [0065](0065-grenzen-als-meting.md)',
  'Herzien: 2026-11-03 (#469): gewijzigd door [0069](0069-agent-merge-niet-kritiek.md) ("zodra de GitHub App er is");',
  '[0070](0070-meting-die-stuurt.md) punt 1',
  '',
  'Herziet [0063](0063-compacte-kennisbasis-en-lichtere-werkstraat.md) punt 3 en 7. Uitwerking: specs',
  '[leesbudget](../specs/leesbudget.md) en [rolhek-lezen](../specs/rolhek-lezen.md).',
  '',
);

const KOP_0066 = lines(
  '# 0066 — Schrijfgrens van subagents op effect, niet op de shellvorm',
  '',
  'Status: geaccepteerd',
  '',
  'Herzien: 2026-11-03 (#454): punt 3 en de buitenscope "hoofdsessie" volgen [0071](0071-rolhek-vooraf-vaste-lijst.md)',
  'Herzien: 2026-11-03 (#469): gewijzigd door [0071](0071-rolhek-vooraf-vaste-lijst.md) punt 3',
  '',
  'Vult [0045](0045-railwerk.md) aan: het rolhek blijft vooraf toetsen, en toetst daarnaast achteraf wat een Bash-commando',
  'van een subagent echt veranderde. Uitwerking: spec [rolhek-effect](../specs/rolhek-effect.md).',
  '',
);

describe('herzieningsPunten: echte regels', () => {
  test.each<[string, string, string, { genoemd: boolean; punten: number[] }]>([
    [
      '0063 → 0064: punten vóór de enige link',
      KOP_0063,
      '0064-leesbudget-per-laag.md',
      { genoemd: true, punten: [3, 7] },
    ],
    [
      '0063 → 0065: volgende Herzien-regel sluit het blok',
      KOP_0063,
      '0065-grenzen-als-meting.md',
      { genoemd: true, punten: [3] },
    ],
    [
      '0063 → 0045: de Herziet-clausule is geen herzieningsregel',
      KOP_0063,
      '0045-railwerk.md',
      { genoemd: false, punten: [] },
    ],
    ['0064 → 0065', KOP_0064, '0065-grenzen-als-meting.md', { genoemd: true, punten: [1, 3] }],
    [
      '0064 → 0069: twee links, segment na 0069 tot de puntkomma heeft geen punten',
      KOP_0064,
      '0069-agent-merge-niet-kritiek.md',
      { genoemd: true, punten: [] },
    ],
    [
      '0064 → 0070: link op een vervolgregel, segment na 0070',
      KOP_0064,
      '0070-meting-die-stuurt.md',
      { genoemd: true, punten: [1] },
    ],
    [
      '0064 → 0063: de Herziet-clausule onder de lege regel hoort niet bij het blok',
      KOP_0064,
      '0063-compacte-kennisbasis-en-lichtere-werkstraat.md',
      { genoemd: false, punten: [] },
    ],
    [
      '0066 → 0071: twee blokken samengevoegd, uniek',
      KOP_0066,
      '0071-rolhek-vooraf-vaste-lijst.md',
      { genoemd: true, punten: [3] },
    ],
    ['0066 → 0045: alleen in `Vult … aan`', KOP_0066, '0045-railwerk.md', { genoemd: false, punten: [] }],
    [
      '0054 → 0057: genoemd zonder punten',
      KOP_0054,
      '0057-risicogestuurde-werkstraat.md',
      { genoemd: true, punten: [] },
    ],
    [
      '0056 → 0063: blok over twee regels, punt vóór de enige link',
      KOP_0056,
      '0063-compacte-kennisbasis-en-lichtere-werkstraat.md',
      { genoemd: true, punten: [5] },
    ],
    [
      '0056 → 0058: vervolgregel binnen het blok',
      KOP_0056,
      '0058-beperkte-fixroute-en-volledige-featurestraat.md',
      { genoemd: true, punten: [] },
    ],
  ])('adr-herzien/AC-2: %s', (...[, kopTekst, bron, verwacht]) => {
    expect(herzieningsPunten(kopTekst, bron)).toStrictEqual(verwacht);
  });
});

const h = (...regels: string[]): string =>
  lines('# 0010 — A', '', 'Status: geaccepteerd', '', ...regels, '', '## Context', '');

describe('herzieningsPunten: vormen', () => {
  test.each<[string, string, { genoemd: boolean; punten: number[] }]>([
    [
      'link naar B met punten erna',
      h('Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 3 en 7'),
      { genoemd: true, punten: [3, 7] },
    ],
    ['B als heel woord zonder link', h('Herzien: 2026-11-03 (#1): punt 2 volgt 0020'), { genoemd: true, punten: [2] }],
    [
      'B-nummer als deel van een woord telt niet',
      h('Herzien: 2026-11-03 (#1): punt 2 volgt 100201 en R-0020x'),
      { genoemd: false, punten: [] },
    ],
    [
      'bereik en herhaald punt, gesorteerd',
      h('Herzien: 2026-11-03 (#1): [0020](0020-b.md) punt 9, en punt 2–4'),
      { genoemd: true, punten: [2, 3, 4, 9] },
    ],
    [
      'vervolgregel tot de lege regel',
      h('Herzien: 2026-11-03 (#1): gewijzigd door', '[0020](0020-b.md) punt 5'),
      { genoemd: true, punten: [5] },
    ],
    [
      'twee blokken die B noemen tellen samen',
      h(
        'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 7',
        'Herzien: 2026-11-04 (#2): gewijzigd door [0020](0020-b.md) punt 3',
      ),
      { genoemd: true, punten: [3, 7] },
    ],
    [
      'een blok dat B niet noemt telt niet mee',
      h(
        'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 7',
        'Herzien: 2026-11-04 (#2): punt 3 volgt [0030](0030-c.md)',
      ),
      { genoemd: true, punten: [7] },
    ],
    [
      'meer links: alleen het segment na B tot de volgende link',
      h('Herzien: 2026-11-03 (#1): [0030](0030-c.md) punt 1, [0020](0020-b.md) punt 4 en [0040](0040-d.md) punt 8'),
      { genoemd: true, punten: [4] },
    ],
    [
      'meer links: segment na B eindigt bij de puntkomma',
      h('Herzien: 2026-11-03 (#1): [0020](0020-b.md) punt 4; punt 6 volgt [0030](0030-c.md)'),
      { genoemd: true, punten: [4] },
    ],
    ['geen herzieningsregel', h('Wijzigt [0020](0020-b.md) punt 1.'), { genoemd: false, punten: [] }],
  ])('adr-herzien/AC-2: %s', (_naam, kopTekst, verwacht) => {
    expect(herzieningsPunten(kopTekst, '0020-b.md')).toStrictEqual(verwacht);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// adrHerzienViolations (AC-1, AC-2, AC-4, AC-5)
// ---------------------------------------------------------------------------------------------------------------------

const A = 'docs/adr/0010-a.md';
const B = 'docs/adr/0020-b.md';
const SLEUTEL = 'docs:adr-herzien:docs/adr/0010-a.md:0020-b.md';

function adr(nummer: string, status: string, ...kopRegels: string[]): string {
  return lines(`# ${nummer} — titel`, '', `Status: ${status}`, '', ...kopRegels, '', '## Context', '', 'Tekst.', '');
}

function check(bestanden: Record<string, string>): { key: string; message: string }[] {
  const files = Object.keys(bestanden);
  const read = (file: string): string => {
    const inhoud = bestanden[file];
    if (inhoud === undefined) throw new Error(`ENOENT: ${file}`);
    return inhoud;
  };
  return adrHerzienViolations(files, read);
}

const keys = (bestanden: Record<string, string>): string[] =>
  check(bestanden)
    .map(({ key }) => key)
    .sort();

const B_WIJZIGT = adr('0020', 'geaccepteerd', 'Wijzigt [0010](0010-a.md) punt 3 en 7.');
const A_MET_REGEL = adr(
  '0010',
  'geaccepteerd',
  'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 3 en 7',
);
const A_ZONDER = adr('0010', 'geaccepteerd');

describe('adrHerzienViolations', () => {
  test('adr-herzien/AC-1: basis — A met herzieningsregel die B en de punten noemt: groen', () => {
    expect(check({ [A]: A_MET_REGEL, [B]: B_WIJZIGT })).toStrictEqual([]);
  });

  test('adr-herzien/AC-1: A zonder herzieningsregel voor B: één overtreding met A en B', () => {
    const uit = check({ [A]: A_ZONDER, [B]: B_WIJZIGT });

    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(uit[0]?.message).toContain(A);
    expect(uit[0]?.message).toContain('0020');
  });

  test('adr-herzien/AC-1: een herzieningsregel die een ander ADR noemt telt niet', () => {
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0030](0030-c.md) punt 3 en 7');

    expect(keys({ [A]: a, [B]: B_WIJZIGT })).toStrictEqual([SLEUTEL]);
  });

  test('adr-herzien/AC-1: een herzieningsregel die B alleen bij nummer noemt telt', () => {
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): punt 3 en 7 gewijzigd door 0020');

    expect(keys({ [A]: a, [B]: B_WIJZIGT })).toStrictEqual([]);
  });

  test('adr-herzien/AC-1: `Herziet` en `Vervangt` eisen ook een regel', () => {
    expect(keys({ [A]: A_ZONDER, [B]: adr('0020', 'geaccepteerd', 'Herziet [0010](0010-a.md).') })).toStrictEqual([
      SLEUTEL,
    ]);
    expect(keys({ [A]: A_ZONDER, [B]: adr('0020', 'geaccepteerd', 'Vervangt [0010](0010-a.md).') })).toStrictEqual([
      SLEUTEL,
    ]);
  });

  test('adr-herzien/AC-1: B zonder punten, A noemt B zonder punten: groen', () => {
    const b = adr('0020', 'geaccepteerd', 'Wijzigt [0010](0010-a.md) "een zinsdeel".');
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) (een zinsdeel)');

    expect(keys({ [A]: a, [B]: b })).toStrictEqual([]);
  });

  test('adr-herzien/AC-3: `Vult [A] aan` eist niets', () => {
    expect(
      keys({ [A]: A_ZONDER, [B]: adr('0020', 'geaccepteerd', 'Vult [0010](0010-a.md) punt 3 aan.') }),
    ).toStrictEqual([]);
  });

  test('adr-herzien/AC-1: een clausule na de kop (onder `## Context`) eist niets', () => {
    const b = lines(
      '# 0020 — B',
      '',
      'Status: geaccepteerd',
      '',
      '## Context',
      '',
      'Wijzigt [0010](0010-a.md) punt 3.',
      '',
    );

    expect(keys({ [A]: A_ZONDER, [B]: b })).toStrictEqual([]);
  });

  test('adr-herzien/AC-2: één ontbrekend punt: overtreding met dat punt', () => {
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 3');
    const uit = check({ [A]: a, [B]: B_WIJZIGT });

    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(uit[0]?.message).toContain(A);
    expect(uit[0]?.message).toContain('0020');
    expect(uit[0]?.message).toContain('punt 7');
    expect(uit[0]?.message).not.toContain('punt 3');
  });

  test('adr-herzien/AC-2: meer ontbrekende punten in de melding als "punt 3, 7"', () => {
    const b = adr('0020', 'geaccepteerd', 'Wijzigt [0010](0010-a.md) punt 3, 5 en 7.');
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 5');
    const uit = check({ [A]: a, [B]: b });

    expect(uit).toHaveLength(1);
    expect(uit[0]?.message).toContain('punt 3, 7');
  });

  test('adr-herzien/AC-2: regel noemt B zonder punten terwijl B punten noemt: rood met alle punten', () => {
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) (iets)');
    const uit = check({ [A]: a, [B]: B_WIJZIGT });

    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(uit[0]?.message).toContain('punt 3, 7');
  });

  test('adr-herzien/AC-2: punten uit een bereik in B, regel met de losse nummers: groen', () => {
    const b = adr('0020', 'geaccepteerd', 'Wijzigt [0010](0010-a.md) punt 3–5.');
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 3, 4 en 5');

    expect(keys({ [A]: a, [B]: b })).toStrictEqual([]);
  });

  test('adr-herzien/AC-2: B noemt A in twee clausules: punten samengevoegd', () => {
    const b = adr('0020', 'geaccepteerd', 'Wijzigt [0010](0010-a.md) punt 1. Herziet [0010](0010-a.md) punt 4.');
    const groen = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 1 en 4');
    const rood = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 1');

    expect(keys({ [A]: groen, [B]: b })).toStrictEqual([]);
    const uit = check({ [A]: rood, [B]: b });
    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(uit[0]?.message).toContain('punt 4');
  });

  test('adr-herzien/AC-2: twee herzieningsregels in A die B noemen tellen samen', () => {
    const a = adr(
      '0010',
      'geaccepteerd',
      'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 3',
      'Herzien: 2026-11-04 (#2): gewijzigd door [0020](0020-b.md) punt 7',
    );

    expect(keys({ [A]: a, [B]: B_WIJZIGT })).toStrictEqual([]);
  });

  test('adr-herzien/AC-2: één overtreding per (A,B), ook bij twee doelen in B', () => {
    const c = 'docs/adr/0011-c.md';
    const b = adr('0020', 'geaccepteerd', 'Wijzigt [0010](0010-a.md) punt 3 en [0011](0011-c.md) punt 2.');

    expect(keys({ [A]: A_ZONDER, [c]: adr('0011', 'geaccepteerd'), [B]: b })).toStrictEqual([
      SLEUTEL,
      'docs:adr-herzien:docs/adr/0011-c.md:0020-b.md',
    ]);
  });

  test.each([
    ['A vervangen', { [A]: adr('0010', 'vervangen door [0030](0030-c.md)'), [B]: B_WIJZIGT }],
    ['A vervallen', { [A]: adr('0010', 'vervallen'), [B]: B_WIJZIGT }],
    ['B voorstel', { [A]: A_ZONDER, [B]: adr('0020', 'voorstel', 'Wijzigt [0010](0010-a.md) punt 3 en 7.') }],
    ['B vervallen', { [A]: A_ZONDER, [B]: adr('0020', 'vervallen', 'Wijzigt [0010](0010-a.md) punt 3 en 7.') }],
    [
      'A in het archief',
      {
        'docs/adr/archief/0010-a.md': A_ZONDER,
        [B]: adr('0020', 'geaccepteerd', 'Wijzigt [0010](archief/0010-a.md) punt 3 en 7.'),
      },
    ],
    ['B in het archief', { [A]: A_ZONDER, 'docs/adr/archief/0020-b.md': B_WIJZIGT }],
    ['A bestaat niet (de linkcontrole meldt dat al)', { [B]: B_WIJZIGT }],
    ['bestanden buiten docs/adr/ tellen niet als B', { [A]: A_ZONDER, 'docs/specs/0020-b.md': B_WIJZIGT }],
  ])('adr-herzien/AC-4: %s: niets', (_naam, bestanden) => {
    expect(check(bestanden)).toStrictEqual([]);
  });

  test('adr-herzien/AC-4: basis bij de AC-4-gevallen — dezelfde B met een geaccepteerde A zonder regel is rood', () => {
    expect(keys({ [A]: A_ZONDER, [B]: B_WIJZIGT })).toStrictEqual([SLEUTEL]);
  });

  test("adr-herzien/AC-5: twee ADR's met hetzelfde nummer: het doelbestand van de link bepaalt A", () => {
    const een = 'docs/adr/0039-een.md';
    const twee = 'docs/adr/0039-twee.md';
    const b = adr('0020', 'geaccepteerd', 'Wijzigt [0039](0039-twee.md) punt 1.');
    const regel = 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 1';

    expect(
      keys({ [een]: adr('0039', 'geaccepteerd', regel), [twee]: adr('0039', 'geaccepteerd'), [B]: b }),
    ).toStrictEqual(['docs:adr-herzien:docs/adr/0039-twee.md:0020-b.md']);
    expect(
      keys({ [een]: adr('0039', 'geaccepteerd'), [twee]: adr('0039', 'geaccepteerd', regel), [B]: b }),
    ).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// check-docs met een fixture-repository (AC-6) en de repo zelf (AC-7)
// ---------------------------------------------------------------------------------------------------------------------

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'adr-herzien-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

const PREFIX = 'docs:adr-herzien:';

describe('check-docs (docsKrimp)', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_ACTIONS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('adr-herzien/AC-6: fixture zonder herzieningsregel is rood', async () => {
    const uit = (await docsKrimp(repo({ [A]: A_ZONDER, [B]: B_WIJZIGT }))).filter(({ key }) => key.startsWith(PREFIX));

    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(uit[0]?.message).toContain(A);
  });

  test('adr-herzien/AC-6: dezelfde fixture met de herzieningsregel is groen', async () => {
    const uit = (await docsKrimp(repo({ [A]: A_MET_REGEL, [B]: B_WIJZIGT }))).filter(({ key }) =>
      key.startsWith(PREFIX),
    );

    expect(uit).toStrictEqual([]);
  });

  test('adr-herzien/AC-6: fixture met een ontbrekend puntnummer is rood', async () => {
    const a = adr('0010', 'geaccepteerd', 'Herzien: 2026-11-03 (#1): gewijzigd door [0020](0020-b.md) punt 3');
    const uit = (await docsKrimp(repo({ [A]: a, [B]: B_WIJZIGT }))).filter(({ key }) => key.startsWith(PREFIX));

    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(uit[0]?.message).toContain('punt 7');
  });

  test('adr-herzien/AC-7: de overtreding loopt nooit via de baseline (niet in docsViolations)', async () => {
    const root = repo({ [A]: A_ZONDER, [B]: B_WIJZIGT });

    expect((await docsKrimp(root)).some(({ key }) => key.startsWith(PREFIX))).toBe(true);
    expect((await docsViolations(root)).filter(({ key }) => key.startsWith(PREFIX))).toStrictEqual([]);
  });
});

describe('de repo zelf', () => {
  test('adr-herzien/AC-7: adrHerzienViolations op alle getrackte bestanden is leeg', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');

    expect(adrHerzienViolations(files, read)).toStrictEqual([]);
  });

  test('adr-herzien/AC-7: .kit/baseline.json heeft geen sleutel voor deze check', () => {
    expect(readFileSync(path.join(ROOT, '.kit/baseline.json'), 'utf8')).not.toContain(PREFIX);
  });
});

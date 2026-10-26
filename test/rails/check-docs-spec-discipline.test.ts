import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// Spec-discipline: een open vraag mag niet in een goedgekeurde of gebouwde spec staan (`:open-vraag`),
// en een voorgeschreven vorm-pad moet bestaan zolang de spec voorstel of goedgekeurd is (`:vorm`).
const SPEC = 'docs/specs/demo.md';
const OPEN = '- **OV-1 ⚠ open** — Welke limiet? A; B.';
const BESLOTEN = '- **OV-2 ✅ besloten** — Limiet is 10.';

function spec(opties: {
  status: string;
  open?: string[];
  vorm?: string[];
  randgeval?: string;
  hergebruik?: boolean;
  openKop?: string;
  acceptatie?: string;
  na?: string[];
}): string {
  const kop = opties.openKop ?? '## Open vragen';
  const open = opties.open === undefined ? [] : [kop, '', ...opties.open, ''];
  const vorm = opties.vorm === undefined ? [] : ['## Kopieer de vorm van', '', ...opties.vorm, ''];
  const hergebruik = opties.hergebruik === false ? [] : ['## Hergebruik en UX', '', 'Bestaande kitcomponenten.', ''];
  const randgeval = opties.randgeval === undefined ? [] : ['## Randgevallen', '', opties.randgeval, ''];
  return [
    '---',
    `status: ${opties.status}`,
    'namespace: demo',
    '---',
    '',
    '# Demo',
    '',
    ...hergebruik,
    ...randgeval,
    ...open,
    '## Acceptatiecriteria',
    '',
    opties.acceptatie ?? 'Tekst.',
    '',
    ...vorm,
    ...(opties.na ?? []),
  ].join('\n');
}

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-spec-discipline-'));
  const all = { 'package.json': JSON.stringify({ scripts: {} }), 'src/api/routes/users.ts': '', ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function keys(files: Record<string, string>, suffix: string): Promise<string[]> {
  const violations = await docsViolations(repo(files));
  return violations.map((violation) => violation.key).filter((key) => key.endsWith(suffix));
}

const openVraag = (files: Record<string, string>) => keys(files, ':open-vraag');
const vorm = (files: Record<string, string>) => keys(files, ':vorm');

test.each(['goedgekeurd', 'gebouwd'])('open vraag bij status %s: overtreding', async (status) => {
  expect(await openVraag({ [SPEC]: spec({ status, open: [OPEN] }) })).toStrictEqual([`docs:${SPEC}:open-vraag`]);
});

test('meerdere open vragen geven hooguit één overtreding', async () => {
  const open = [OPEN, '- **OV-3 ⚠ open** — Nog een vraag; X; Y.'];
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open }) })).toStrictEqual([`docs:${SPEC}:open-vraag`]);
});

test.each(['voorstel', 'vervallen'])('open vraag bij status %s: geen overtreding', async (status) => {
  expect(await openVraag({ [SPEC]: spec({ status, open: [OPEN] }) })).toStrictEqual([]);
});

test('een besloten vraag bij goedgekeurd: geen overtreding', async () => {
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open: [BESLOTEN] }) })).toStrictEqual([]);
});

test('open vraag naast een besloten vraag bij goedgekeurd: overtreding', async () => {
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open: [BESLOTEN, OPEN] }) })).toStrictEqual([
    `docs:${SPEC}:open-vraag`,
  ]);
});

test('"⚠ open" buiten de sectie Open vragen: geen overtreding', async () => {
  const randgeval = '- Bij een leeg veld ⚠ open: wat tonen we?';
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', randgeval, open: [BESLOTEN] }) })).toStrictEqual([]);
});

test('een spec zonder sectie Open vragen: geen overtreding', async () => {
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd' }) })).toStrictEqual([]);
});

test('een sjabloonbestand met underscore wordt niet getoetst op open vragen', async () => {
  expect(await openVraag({ 'docs/specs/_demo.md': spec({ status: 'goedgekeurd', open: [OPEN] }) })).toStrictEqual([]);
});

test.each(['voorstel', 'goedgekeurd'])('een ontbrekend vorm-pad bij status %s: overtreding', async (status) => {
  const tekst = spec({ status, vorm: ['- `src/api/routes/bestaat-niet.ts` — gouden pad.'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([`docs:${SPEC}:vorm`]);
});

test('meerdere ontbrekende vorm-paden geven hooguit één overtreding', async () => {
  const tekst = spec({ status: 'goedgekeurd', vorm: ['- `src/a/weg.ts`', '- `src/b/ook-weg.ts`'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([`docs:${SPEC}:vorm`]);
});

test.each(['gebouwd', 'vervallen'])('een ontbrekend vorm-pad bij status %s: geen overtreding', async (status) => {
  const tekst = spec({ status, vorm: ['- `src/api/routes/bestaat-niet.ts`'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([]);
});

test('een bestaand vorm-pad: geen overtreding', async () => {
  const tekst = spec({ status: 'goedgekeurd', vorm: ['- `src/api/routes/users.ts` — gouden pad.'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([]);
});

test('een spec zonder sectie Kopieer de vorm van: geen overtreding', async () => {
  expect(await vorm({ [SPEC]: spec({ status: 'goedgekeurd' }) })).toStrictEqual([]);
});

test('een backtick-token dat geen pad is, wordt genegeerd', async () => {
  const tekst = spec({ status: 'goedgekeurd', vorm: ['- Gebruik `defineRoute` en `src/api/routes/users.ts`.'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([]);
});

test('een ontbrekend pad naast een bestaand pad: overtreding', async () => {
  const tekst = spec({ status: 'goedgekeurd', vorm: ['- `src/api/routes/users.ts` en `src/api/routes/weg.ts`'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([`docs:${SPEC}:vorm`]);
});

test('beide overtredingen komen naast de bestaande hergebruik-check voor', async () => {
  const tekst = spec({
    status: 'goedgekeurd',
    hergebruik: false,
    open: [OPEN],
    vorm: ['- `src/api/routes/weg.ts`'],
  });
  const violations = (await docsViolations(repo({ [SPEC]: tekst }))).map((violation) => violation.key);
  expect(violations).toContain(`docs:${SPEC}:open-vraag`);
  expect(violations).toContain(`docs:${SPEC}:vorm`);
});

test('"⚠ open" in een sectie na Open vragen: geen overtreding', async () => {
  const tekst = spec({
    status: 'goedgekeurd',
    open: [BESLOTEN],
    acceptatie: '- Bij een leeg veld ⚠ open: wat tonen we?',
  });
  expect(await openVraag({ [SPEC]: tekst })).toStrictEqual([]);
});

test('een ontbrekend pad in een sectie na Kopieer de vorm van: geen overtreding', async () => {
  const na = ['## Voorbeelden', '', '- `src/api/routes/weg.ts`', ''];
  const tekst = spec({ status: 'voorstel', vorm: ['- `src/api/routes/users.ts`'], na });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([]);
});

test('een open vraag onder een ###-subkop in Open vragen: overtreding', async () => {
  const open = ['### Limieten', '', OPEN];
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open }) })).toStrictEqual([`docs:${SPEC}:open-vraag`]);
});

test('de kop "Open vragen voor de eigenaar" telt als sectie Open vragen', async () => {
  const tekst = spec({ status: 'goedgekeurd', openKop: '## Open vragen voor de eigenaar', open: [OPEN] });
  expect(await openVraag({ [SPEC]: tekst })).toStrictEqual([`docs:${SPEC}:open-vraag`]);
});

// Gewijzigd (PR fix/werkstraat-review-klein): de hele sectie telt, ook een regel zonder opsommingsteken.
test('een regel met ⚠ open zonder opsommingsteken telt ook als open vraag', async () => {
  const uitleg = 'Een vraag zonder aanbeveling krijgt ⚠ open en blokkeert goedgekeurd.';
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open: [uitleg, '', BESLOTEN] }) })).toStrictEqual([
    `docs:${SPEC}:open-vraag`,
  ]);
});

test('een lijstitem met ⚠ open naast een uitlegregel: overtreding', async () => {
  const uitleg = 'Een vraag zonder aanbeveling krijgt ⚠ open en blokkeert goedgekeurd.';
  const open = [uitleg, '', BESLOTEN, '- **OV-2 ⚠ open** — Welke tekst? A; B.'];
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open }) })).toStrictEqual([`docs:${SPEC}:open-vraag`]);
});

test('een vorm-pad met regelnummer naar een ontbrekend bestand: overtreding', async () => {
  const tekst = spec({ status: 'voorstel', vorm: ['- `src/api/routes/nietbestaand.ts:40` — gouden pad.'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([`docs:${SPEC}:vorm`]);
});

test('een vorm-pad met regelbereik naar een bestaand bestand: geen overtreding', async () => {
  const tekst = spec({ status: 'voorstel', vorm: ['- `src/api/routes/users.ts:12-20` — gouden pad.'] });
  expect(await vorm({ [SPEC]: tekst })).toStrictEqual([]);
});

test.each([
  ['met U+FE0F', '- **OV-1 ⚠️ open** — Welke limiet? A; B.'],
  ['in hoofdletters', '- **OV-1 ⚠ Open** — Welke limiet? A; B.'],
  ['zonder opsommingsteken', '**OV-1 ⚠ open** — Welke limiet? A; B.'],
])('open vraag %s bij goedgekeurd: overtreding', async (_naam, regel) => {
  expect(await openVraag({ [SPEC]: spec({ status: 'goedgekeurd', open: [regel] }) })).toStrictEqual([
    `docs:${SPEC}:open-vraag`,
  ]);
});

test('open vraag met U+FE0F bij voorstel: geen overtreding (zelfde scope)', async () => {
  const open = ['- **OV-1 ⚠️ Open** — Welke limiet? A; B.'];
  expect(await openVraag({ [SPEC]: spec({ status: 'voorstel', open }) })).toStrictEqual([]);
});

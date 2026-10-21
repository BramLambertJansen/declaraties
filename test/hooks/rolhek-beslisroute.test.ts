import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// ADR 0038 punt 6 en 9: de merge van de eigenaar is de acceptatie. In het rolhek mogen alleen hoofdsessie en architect een
// eigenaarstatus (geaccepteerd, goedgekeurd, vervallen, vervangen door NNNN) schrijven, ook zonder record en ook voor een
// nieuw bestand, en de inhoud van een goedgekeurde spec wijzigen. Developer, tester en docs blijven geweigerd (de developer
// houdt alleen `gebouwd` via `pnpm docs:status`). De lokale A4-weigering blijft voor elke rol: de tekst van een geaccepteerd
// ADR verandert niet en `geaccepteerd` gaat niet terug naar `voorgesteld`.
// De authority hieronder heeft een lege registry: er is geen record op main.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

type Ctx = Parameters<typeof decide>[1];
type Authority = NonNullable<Ctx['authority']>;

const adr = (nr: string, status: string, besluit = 'Iets.'): string =>
  `# ${nr} — Demo\n\nStatus: ${status}\n\n## Besluit\n\n${besluit}\n`;
const spec = (status: string, tekst = 'Bestaande kit.'): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n`;

const ADR_VOORSTEL = 'docs/adr/0099-voorstel.md';
const ADR_GEACC = 'docs/adr/0098-geaccepteerd.md';
const ADR_NIEUW = 'docs/adr/0097-nieuw.md';
const SPEC_VOORSTEL = 'docs/specs/voorstel.md';
const SPEC_GOEDGEKEURD = 'docs/specs/goedgekeurd.md';
const SPEC_NIEUW = 'docs/specs/nieuw.md';

const ADR_VERVALLEN = 'docs/adr/0096-vervallen.md';
const ADR_VERVANGEN = 'docs/adr/0095-vervangen.md';

const FILES: Record<string, string> = {
  [ADR_VERVALLEN]: adr('0096', 'vervallen'),
  [ADR_VERVANGEN]: adr('0095', 'vervangen door 0098'),
  [ADR_VOORSTEL]: adr('0099', 'voorgesteld'),
  [ADR_GEACC]: adr('0098', 'geaccepteerd'),
  [SPEC_VOORSTEL]: spec('voorstel'),
  [SPEC_GOEDGEKEURD]: spec('goedgekeurd'),
};

function authority(): Authority {
  return {
    registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
    repository: 'BramLambertJansen/template',
    branch: 'feat/x',
    trusted: (file) => FILES[file] ?? null,
    working: (file) => FILES[file] ?? null,
    safe: () => true,
  };
}

function run(payload: unknown, met: 'authority' | 'zonder' = 'authority') {
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
    branch: 'feat/x',
    authority: met === 'authority' ? authority() : null,
  });
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...as(agent),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...as(agent),
});

/** Een schrijfactie die een eigenaarstatus zet (of inhoud van een goedgekeurde spec wijzigt), per rol opnieuw gemaakt. */
const SCHRIJFACTIES: [string, (agent?: string) => unknown][] = [
  ['nieuw ADR met Status: geaccepteerd', (a) => write(ADR_NIEUW, adr('0097', 'geaccepteerd'), a)],
  ['nieuw ADR met Status: vervallen', (a) => write(ADR_NIEUW, adr('0097', 'vervallen'), a)],
  ['nieuwe spec met status: goedgekeurd', (a) => write(SPEC_NIEUW, spec('goedgekeurd'), a)],
  ['voorgesteld ADR naar geaccepteerd (Edit)', (a) => edit(ADR_VOORSTEL, ['voorgesteld', 'geaccepteerd'], a)],
  ['voorstel-spec naar goedgekeurd (Edit)', (a) => edit(SPEC_VOORSTEL, ['status: voorstel', 'status: goedgekeurd'], a)],
  [
    'voorstel-spec naar goedgekeurd met inhoud in dezelfde Write',
    (a) => write(SPEC_VOORSTEL, spec('goedgekeurd', 'Andere inhoud.'), a),
  ],
  ['geaccepteerd ADR naar vervangen door 0097', (a) => edit(ADR_GEACC, ['geaccepteerd', 'vervangen door 0097'], a)],
  ['geaccepteerd ADR naar vervallen', (a) => edit(ADR_GEACC, ['geaccepteerd', 'vervallen'], a)],
  [
    'goedgekeurde spec terug naar voorstel',
    (a) => edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', 'status: voorstel'], a),
  ],
  ['goedgekeurde spec naar vervallen', (a) => edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', 'status: vervallen'], a)],
  ['inhoud van een goedgekeurde spec wijzigen', (a) => edit(SPEC_GOEDGEKEURD, ['Bestaande kit.', 'Nieuw gedrag.'], a)],
];

describe('hoofdsessie en architect: een eigenaarstatus of goedgekeurde-spec-inhoud schrijven zonder record (punt 6, 9)', () => {
  describe.each([
    ['hoofdsessie', undefined],
    ['architect', 'architect'],
  ])('%s', (_rol, agent) => {
    test.each(SCHRIJFACTIES)('%s: toegestaan', (_naam, maak) => {
      const decision = run(maak(agent));
      expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
    });
  });

  test.each(SCHRIJFACTIES.filter(([naam]) => naam.includes('goedgekeurd')))(
    '%s: ook zonder authority in het rolhek toegestaan voor de hoofdsessie',
    (_naam, maak) => {
      const decision = run(maak(undefined), 'zonder');
      expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
    },
  );
});

describe('developer, tester en docs: dezelfde schrijfacties blijven geweigerd (punt 6)', () => {
  describe.each(['developer', 'tester', 'docs'])('%s', (agent) => {
    test.each(SCHRIJFACTIES)('%s: geweigerd', (_naam, maak) => {
      expect(run(maak(agent)).deny).not.toHaveLength(0);
    });
  });

  test.each(['developer', 'tester', 'docs'])(
    '%s zet een spec zelf op goedgekeurd, zonder authority: geweigerd',
    (agent) => {
      const decision = run(edit(SPEC_VOORSTEL, ['status: voorstel', 'status: goedgekeurd'], agent), 'zonder');
      expect(decision.deny).not.toHaveLength(0);
    },
  );

  test('developer: gebouwd schrijven via Edit blijft geweigerd (alleen via pnpm docs:status)', () => {
    const gebouwd = `status: gebouwd # #5; gevalideerd: ${'a'.repeat(40)}`;
    expect(run(edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', gebouwd], 'developer')).deny).not.toHaveLength(0);
  });

  test('developer: een voorstel schrijven en wijzigen blijft vrij', () => {
    const decision = run(edit(SPEC_VOORSTEL, ['Bestaande kit.', 'Meer tekst.'], 'developer'));
    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
  });

  test('hoofdsessie en architect: een nieuw ADR met Status: voorgesteld blijft vrij', () => {
    for (const agent of [undefined, 'architect'])
      expect(run(write(ADR_NIEUW, adr('0097', 'voorgesteld'), agent)).deny).toStrictEqual([]);
  });
});

describe('lokale A4 (punt 2): een geaccepteerd ADR wijzigt niet, voor iedere rol', () => {
  const ROLLEN = [
    ['hoofdsessie', undefined],
    ['architect', 'architect'],
    ['developer', 'developer'],
    ['tester', 'tester'],
    ['docs', 'docs'],
  ] as const;

  describe.each(ROLLEN)('%s', (_rol, agent) => {
    test('de inhoud wijzigen, status blijft geaccepteerd: geweigerd', () => {
      expect(run(edit(ADR_GEACC, ['Iets.', 'Iets anders.'], agent)).deny).not.toHaveLength(0);
    });

    test('geaccepteerd naar voorgesteld, alleen de statusregel: geweigerd', () => {
      expect(run(edit(ADR_GEACC, ['Status: geaccepteerd', 'Status: voorgesteld'], agent)).deny).not.toHaveLength(0);
    });

    test('geaccepteerd naar voorgesteld mét nieuwe inhoud (de omweg om A4): geweigerd', () => {
      const decision = run(write(ADR_GEACC, adr('0098', 'voorgesteld', 'Andere inhoud.'), agent));
      expect(decision.deny).not.toHaveLength(0);
    });
  });

  describe.each(ROLLEN.filter(([rol]) => ['hoofdsessie', 'architect', 'developer'].includes(rol)))(
    'melding voor %s',
    (_rol, agent) => {
      test.each([
        ['de inhoud wijzigen', () => edit(ADR_GEACC, ['Iets.', 'Iets anders.'], agent)],
        ['terug naar voorgesteld', () => edit(ADR_GEACC, ['Status: geaccepteerd', 'Status: voorgesteld'], agent)],
        [
          'terug naar voorgesteld met inhoud',
          () => write(ADR_GEACC, adr('0098', 'voorgesteld', 'Andere inhoud.'), agent),
        ],
      ])('%s: verwijst naar een nieuw ADR dat vervangt, niet naar "heropen het voorstel"', (_naam, maak) => {
        const melding = run(maak()).deny.join('\n');
        expect(melding).not.toBe('');
        expect(melding).not.toMatch(/heropen/i);
        expect(melding).toMatch(/nieuw ADR/i);
        expect(melding).toMatch(/vervang/i);
      });
    },
  );
});

describe('ADR 0038 punt 2: vervallen of vervangen ADR terug naar voorgesteld is geweigerd, voor iedere rol', () => {
  describe.each([undefined, 'architect', 'developer', 'tester', 'docs'])('rol %s', (agent) => {
    test.each([
      ['vervallen', ADR_VERVALLEN, 'Status: vervallen'],
      ['vervangen door NNNN', ADR_VERVANGEN, 'Status: vervangen door 0098'],
    ])('%s naar voorgesteld: geweigerd', (_naam, pad, regel) => {
      expect(run(edit(pad, [regel, 'Status: voorgesteld'], agent)).deny).not.toHaveLength(0);
    });
  });
});

// --- Review van ADR 0038: A4 tegen main (de vertrouwde basis), niet tegen de werkmap. ---------------------------------------
// `read` is de werkmap, `authority.trusted` is main. Een ADR die op main nog geen eigenaarstatus heeft, is niet beschermd,
// ook al staat hij in de werkmap al op `geaccepteerd`; een ADR die op main geaccepteerd is, blijft beschermd, ook als de
// werkmap afwijkt of het bestand ontbreekt (na `rm`).

function runBasis(payload: unknown, opties: { main: Record<string, string>; werkmap: Record<string, string> }) {
  const gezag: Authority = {
    ...authority(),
    trusted: (file) => opties.main[file] ?? null,
    working: (file) => opties.werkmap[file] ?? null,
  };
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => opties.werkmap[rel] ?? null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    authority: gezag,
  });
}

const NIEUW_PAD = 'docs/adr/0090-nieuw.md';
const BESLISROLLEN = [
  ['hoofdsessie', undefined],
  ['architect', 'architect'],
] as const;
const ALLE_ROLLEN = [...BESLISROLLEN, ['developer', 'developer'], ['tester', 'tester'], ['docs', 'docs']] as const;

describe.each(BESLISROLLEN)('A4 tegen main: %s', (_rol, agent) => {
  test('a. nieuw ADR (niet op main), werkmap al geaccepteerd: inhoud wijzigen is toegestaan', () => {
    const decision = runBasis(edit(NIEUW_PAD, ['Iets.', 'Iets anders.'], agent), {
      main: {},
      werkmap: { [NIEUW_PAD]: adr('0090', 'geaccepteerd') },
    });
    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
  });

  test('b. nieuw ADR (niet op main), werkmap al geaccepteerd: status terugzetten naar voorgesteld is toegestaan', () => {
    const decision = runBasis(edit(NIEUW_PAD, ['Status: geaccepteerd', 'Status: voorgesteld'], agent), {
      main: {},
      werkmap: { [NIEUW_PAD]: adr('0090', 'geaccepteerd') },
    });
    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
  });

  test('c. op main voorgesteld, werkmap geaccepteerd: inhoud wijzigen is toegestaan', () => {
    const decision = runBasis(edit(NIEUW_PAD, ['Iets.', 'Iets anders.'], agent), {
      main: { [NIEUW_PAD]: adr('0090', 'voorgesteld') },
      werkmap: { [NIEUW_PAD]: adr('0090', 'geaccepteerd') },
    });
    expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
  });
});

describe.each(ALLE_ROLLEN)('A4 tegen main: %s', (_rol, agent) => {
  const nieuweInhoud = adr('0090', 'geaccepteerd', 'Heel andere inhoud.');
  test.each([
    ['het bestand ontbreekt in de werkmap (na rm)', {}],
    ['de werkmap is voorgesteld en afwijkend', { [NIEUW_PAD]: adr('0090', 'voorgesteld', 'Concept.') }],
    ['de werkmap heeft andere inhoud', { [NIEUW_PAD]: adr('0090', 'geaccepteerd', 'Eerder aangepast.') }],
  ])(
    'd. op main geaccepteerd; %s: een Write met nieuwe inhoud en Status: geaccepteerd is geweigerd',
    (_naam, werkmap) => {
      const decision = runBasis(write(NIEUW_PAD, nieuweInhoud, agent), {
        main: { [NIEUW_PAD]: adr('0090', 'geaccepteerd') },
        werkmap,
      });
      expect(decision.deny).not.toHaveLength(0);
    },
  );
});

describe('A4 tegen main: de A4-melding en de terugval zonder authority', () => {
  test('d. de melding bij een op main geaccepteerd ADR verwijst naar een nieuw ADR dat vervangt', () => {
    const decision = runBasis(write(NIEUW_PAD, adr('0090', 'geaccepteerd', 'Heel andere inhoud.')), {
      main: { [NIEUW_PAD]: adr('0090', 'geaccepteerd') },
      werkmap: {},
    });
    const melding = decision.deny.join('\n');
    expect(melding).toMatch(/nieuw ADR/i);
    expect(melding).not.toMatch(/heropen/i);
  });

  test.each(BESLISROLLEN)(
    'e. %s zonder authority: de werkmap is de terugval; inhoud van een geaccepteerd ADR wijzigen is geweigerd',
    (_rol, agent) => {
      const decision = run(edit(ADR_GEACC, ['Iets.', 'Iets anders.'], agent), 'zonder');
      expect(decision.deny).not.toHaveLength(0);
    },
  );

  test.each(BESLISROLLEN)(
    'e. %s zonder authority: een voorgesteld ADR in de werkmap blijft vrij te wijzigen',
    (_rol, agent) => {
      const decision = run(edit(ADR_VOORSTEL, ['Iets.', 'Iets anders.'], agent), 'zonder');
      expect([decision.deny, decision.ask]).toStrictEqual([[], []]);
    },
  );
});

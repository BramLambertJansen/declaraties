import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';

// Spec ontwerp-overnemen, deel 5a: de pure functies van `scripts/kit/ontwerp-meten.mjs` (AC-6 t/m AC-9). De module wordt
// pas in de test geladen (zoals check-roadmap-structuur.test.ts), zodat een ontbrekende export op een assertie faalt.
//
// Contract dat deze test vastlegt (voorstel aan de developer, binnen wat de spec noemt):
//   parseArgs(argv: string[])  argv zonder node en script, zoals process.argv.slice(2); controleert geen bestaan van de bron
//     → { ok: true, opties: { bron, naam, js, uit } } | { ok: false, code: 2, melding }
//   naarOklch(css: string) → 'oklch(L C H)' | 'oklch(L C H / a)' | null (volledig transparant)
//   vatStijlenSamen(elementen) → { kleuren: { tekst, vlak, rand }, lettertypen: { families, maten, gewichten, regelhoogtes },
//     afstanden, radii }, elke lijst [{ waarde: string, aantal: number }]; een element is een object met de berekende
//     stijlen in camelCase (zie ELEMENTEN)
//   uitvoerToegestaan(pad: string, isGenegeerd: (pad) => boolean) → { ok: true } | { ok: false, code: 2, melding }
//   voerUit(argv: string[], { launcher: { launch(opties) }, isGenegeerd, meld: (regel) => void }) → Promise<number>
//     (exitcode); bij een lokaal bestand krijgt launch { args } met --host-resolver-rules=MAP * ~NOTFOUND
//   verzoekToegestaan(bron: string, url: string) → boolean; bron is een absoluut pad naar het .html-bestand (of een
//     https-URL); een symlink binnen de map die naar buiten wijst, telt als buiten (realpath van beide kanten)
//   volgRedirects(bron: string, url: string, haal: (url) => Promise<{ status, headers }>) →
//     Promise<{ toegestaan: boolean, antwoord?: <laatste resultaat van haal>, geblokkeerd: string[] }>; volgt 3xx met
//     headers.location (relatief tegen de huidige stap), roept haal nooit aan voor een doel dat verzoekToegestaan weigert,
//     en stopt na hoogstens 20 aanroepen van haal (dan toegestaan: false)
//   naarOklch: ook oklab() en oklch() met alfa; een onbekend modern formaat (color(), lab()) blijft de ruwe waarde
const MODULE = ['../../scripts/kit', 'ontwerp-meten.mjs'].join('/');

const GEBRUIK = 'Gebruik: node scripts/kit/ontwerp-meten.mjs <bron.html|https-url> --naam <bron> [--js] [--uit <map>]';
const ONGELDIGE_NAAM = "Ongeldige --naam: alleen kleine letters, cijfers en '-'.";
const ALLEEN_HTML = 'Alleen een lokaal .html-bestand of een https-URL.';
const GEEN_CHROMIUM =
  'Geen Chromium beschikbaar: lees de bron statisch (skill ontwerp-overnemen) of draai op een apparaat met Playwright-browsers.';
const nietGenegeerd = (map: string) =>
  `Uitvoermap ${map} is niet door git genegeerd; screenshots horen niet in de repo.`;

async function roep(naam: string, ...args: unknown[]): Promise<unknown> {
  const geladen: unknown = await import(/* @vite-ignore */ MODULE).catch(() => null);
  expect(geladen, 'scripts/kit/ontwerp-meten.mjs laadt').not.toBeNull();
  const functie: unknown = typeof geladen === 'object' && geladen !== null ? Reflect.get(geladen, naam) : undefined;
  expect(typeof functie, `${naam} is een geëxporteerde functie`).toBe('function');
  if (typeof functie !== 'function') throw new Error(`${naam} ontbreekt`);
  const resultaat: unknown = await Reflect.apply(functie, undefined, args);
  return resultaat;
}

function veld(waarde: unknown, ...sleutels: string[]): unknown {
  let huidig = waarde;
  for (const sleutel of sleutels)
    huidig = typeof huidig === 'object' && huidig !== null ? Reflect.get(huidig, sleutel) : undefined;
  return huidig;
}

const tijdelijk = mkdtempSync(path.join(tmpdir(), 'ontwerp-meten-'));
afterAll(() => {
  rmSync(tijdelijk, { recursive: true, force: true });
});

describe('ontwerp-overnemen/AC-6: parseArgs', () => {
  test.each([
    { geval: 'geen bron', argv: ['--naam', 'mijn-bron'], melding: GEBRUIK },
    { geval: 'helemaal niets', argv: [], melding: GEBRUIK },
    { geval: 'een onbekende vlag', argv: ['voorbeeld.html', '--naam', 'mijn-bron', '--snel'], melding: GEBRUIK },
    { geval: '--naam ../x', argv: ['voorbeeld.html', '--naam', '../x'], melding: ONGELDIGE_NAAM },
    { geval: '--naam Bron', argv: ['voorbeeld.html', '--naam', 'Bron'], melding: ONGELDIGE_NAAM },
    { geval: 'een http-bron', argv: ['http://example.com', '--naam', 'ex'], melding: ALLEEN_HTML },
    { geval: 'een file-bron', argv: ['file:///tmp/voorbeeld.html', '--naam', 'ex'], melding: ALLEEN_HTML },
    { geval: 'een ftp-bron', argv: ['ftp://example.com/voorbeeld.html', '--naam', 'ex'], melding: ALLEEN_HTML },
  ])('ontwerp-overnemen/AC-6: weigert $geval met exitcode 2 en de letterlijke melding', async ({ argv, melding }) => {
    const resultaat = await roep('parseArgs', argv);

    expect(resultaat).toStrictEqual({ ok: false, code: 2, melding });
  });

  test('ontwerp-overnemen/AC-6: aanvaardt een lokaal html-bestand met de standaard-uitvoermap', async () => {
    const resultaat = await roep('parseArgs', ['voorbeeld.html', '--naam', 'mijn-bron']);

    expect(veld(resultaat, 'ok')).toBe(true);
    expect(String(veld(resultaat, 'opties', 'bron'))).toMatch(/(?:^|[\\/])voorbeeld\.html$/);
    expect(veld(resultaat, 'opties', 'naam')).toBe('mijn-bron');
    expect(veld(resultaat, 'opties', 'js')).toBe(false);
    const uit = String(veld(resultaat, 'opties', 'uit'));
    expect(path.relative(process.cwd(), path.resolve(uit))).toBe(path.join('.runner-output', 'ontwerp', 'mijn-bron'));
  });

  test('ontwerp-overnemen/AC-6: aanvaardt een https-URL met --js', async () => {
    const resultaat = await roep('parseArgs', ['https://example.com', '--naam', 'ex', '--js']);

    expect(veld(resultaat, 'ok')).toBe(true);
    expect(String(veld(resultaat, 'opties', 'bron'))).toMatch(/^https:\/\/example\.com\/?$/);
    expect(veld(resultaat, 'opties', 'naam')).toBe('ex');
    expect(veld(resultaat, 'opties', 'js')).toBe(true);
    const uit = String(veld(resultaat, 'opties', 'uit'));
    expect(path.relative(process.cwd(), path.resolve(uit))).toBe(path.join('.runner-output', 'ontwerp', 'ex'));
  });
});

// Referentie: sRGB → OKLab → OKLCH volgens Björn Ottosson (https://bottosson.github.io/posts/oklab/).
function referentieOklch(rood: number, groen: number, blauw: number): [number, number, number] {
  const lineair = (kanaal: number) => {
    const c = kanaal / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lineair(rood), lineair(groen), lineair(blauw)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lab = [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
  const [lichtheid = 0, a = 0, bAs = 0] = lab;
  const tint = (Math.atan2(bAs, a) * 180) / Math.PI;
  return [lichtheid, Math.hypot(a, bAs), tint < 0 ? tint + 360 : tint];
}

function leesOklch(waarde: unknown): number[] {
  const match = /^oklch\((\S+) (\S+) (\S+)\)$/.exec(String(waarde));
  expect(match, `${String(waarde)} is oklch(L C H)`).not.toBeNull();
  return [match?.[1], match?.[2], match?.[3]].map(Number);
}

describe('ontwerp-overnemen/AC-7: naarOklch', () => {
  test.each([
    { css: '#ffffff', verwacht: 'oklch(1 0 0)' },
    { css: 'rgb(0, 0, 0)', verwacht: 'oklch(0 0 0)' },
  ])('ontwerp-overnemen/AC-7: $css wordt $verwacht', async ({ css, verwacht }) => {
    expect(await roep('naarOklch', css)).toBe(verwacht);
  });

  test('ontwerp-overnemen/AC-7: rgb(29, 78, 216) ligt binnen 0,002 van de OKLab-formule, met drie decimalen', async () => {
    const uitkomst = await roep('naarOklch', 'rgb(29, 78, 216)');
    const [l = Number.NaN, c = Number.NaN, h = Number.NaN] = leesOklch(uitkomst);
    const [refL, refC, refH] = referentieOklch(29, 78, 216);

    expect(Math.abs(l - refL)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(c - refC)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(h - refH)).toBeLessThanOrEqual(0.002);
    for (const deel of String(uitkomst).slice('oklch('.length, -1).split(' '))
      expect(deel).toMatch(/^\d+(?:\.\d{1,3})?$/);
  });

  // Vaste externe referentie, onafhankelijk van referentieOklch hierboven berekend via de route van CSS Color 4: sRGB →
  // XYZ (D65) → LMS (M1) → kubuswortel → OKLab (M2) → OKLCH: L 0.48820, C 0.21717, H 264.376°. Beide routes verschillen
  // minder dan 1e-4; 0,002 laat alleen de afronding op drie decimalen over, ook voor de tint in graden.
  test('ontwerp-overnemen/AC-7: rgb(29, 78, 216) ligt binnen 0,002 van de vaste referentie oklch(0.4882 0.2172 264.376)', async () => {
    const [l = Number.NaN, c = Number.NaN, h = Number.NaN] = leesOklch(await roep('naarOklch', 'rgb(29, 78, 216)'));

    expect(Math.abs(l - 0.4882)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(c - 0.21717)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(h - 264.376)).toBeLessThanOrEqual(0.002);
  });

  // De browser geeft moderne kleuren soms al als oklab(); C = √(a² + b²), H = atan2(b, a): 0,1 en -0,1 → 0,141 en 315°.
  test.each([
    { css: 'oklab(0.5 0.1 -0.1)', verwacht: 'oklch(0.5 0.141 315)' },
    { css: 'oklab(0.5 0.1 -0.1 / 0.5)', verwacht: 'oklch(0.5 0.141 315 / 0.5)' },
  ])('ontwerp-overnemen/AC-7: $css wordt $verwacht', async ({ css, verwacht }) => {
    expect(await roep('naarOklch', css)).toBe(verwacht);
  });

  test('ontwerp-overnemen/AC-7: oklch met alfa 0 is volledig transparant en geeft null', async () => {
    expect(await roep('naarOklch', 'oklch(0.5 0.1 200 / 0)')).toBeNull();
  });

  // Een onbekend modern formaat gaat niet verloren: het blijft de ruwe waarde, zodat de mapping het nog ziet.
  test.each(['color(display-p3 1 0 0)', 'lab(50 40 30)'])(
    'ontwerp-overnemen/AC-7: %s blijft de ruwe waarde, niet null',
    async (css) => {
      expect(await roep('naarOklch', css)).toBe(css);
    },
  );

  test('ontwerp-overnemen/AC-7: rgba(255, 0, 0, 0.5) eindigt op / 0.5', async () => {
    expect(String(await roep('naarOklch', 'rgba(255, 0, 0, 0.5)'))).toMatch(/^oklch\(\S+ \S+ \S+ \/ 0\.5\)$/);
  });

  test.each(['rgba(0, 0, 0, 0)', 'transparent'])('ontwerp-overnemen/AC-7: %s geeft null', async (css) => {
    expect(await roep('naarOklch', css)).toBeNull();
  });
});

// Berekende stijlen zoals getComputedStyle ze geeft (camelCase), per zichtbaar element.
const ELEMENTEN = [
  {
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgb(255, 255, 255)',
    borderColor: 'rgb(0, 0, 0)',
    fontFamily: '"Inter", sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '24px',
    padding: '16px',
    margin: '8px',
    gap: '16px',
    borderRadius: '8px',
  },
  {
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderColor: 'rgb(0, 0, 0)',
    fontFamily: '"Inter", sans-serif',
    fontSize: '14px',
    fontWeight: '700',
    lineHeight: '20px',
    padding: '8px',
    margin: '16px',
    gap: '8px',
    borderRadius: '8px',
  },
  {
    color: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(0, 0, 0)',
    borderColor: 'transparent',
    fontFamily: '"Inter", sans-serif',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '24px',
    padding: '16px',
    margin: '16px',
    gap: '16px',
    borderRadius: '4px',
  },
];

const waarden = (lijst: unknown) => (Array.isArray(lijst) ? lijst.map((item: unknown) => veld(item, 'waarde')) : []);

describe('ontwerp-overnemen/AC-8: vatStijlenSamen', () => {
  test('ontwerp-overnemen/AC-8: telt kleuren apart voor tekst, vlak en rand, gesorteerd, zonder transparant', async () => {
    const samen = await roep('vatStijlenSamen', ELEMENTEN);

    expect(veld(samen, 'kleuren')).toStrictEqual({
      tekst: [
        { waarde: 'oklch(0 0 0)', aantal: 2 },
        { waarde: 'oklch(1 0 0)', aantal: 1 },
      ],
      // Gelijk aantal: daarna op waarde.
      vlak: [
        { waarde: 'oklch(0 0 0)', aantal: 1 },
        { waarde: 'oklch(1 0 0)', aantal: 1 },
      ],
      rand: [{ waarde: 'oklch(0 0 0)', aantal: 2 }],
    });
  });

  test('ontwerp-overnemen/AC-8: maten in rem en families zonder aanhalingstekens', async () => {
    const samen = await roep('vatStijlenSamen', ELEMENTEN);

    expect(veld(samen, 'lettertypen', 'families')).toStrictEqual([{ waarde: 'Inter, sans-serif', aantal: 3 }]);
    expect(veld(samen, 'lettertypen', 'maten')).toStrictEqual([
      { waarde: '1rem', aantal: 2 },
      { waarde: '0.875rem', aantal: 1 },
    ]);
    expect(veld(samen, 'lettertypen', 'regelhoogtes')).toStrictEqual([
      { waarde: '1.5rem', aantal: 2 },
      { waarde: '1.25rem', aantal: 1 },
    ]);
    expect(waarden(veld(samen, 'lettertypen', 'gewichten')).map(String)).toStrictEqual(['400', '700']);
  });

  test('ontwerp-overnemen/AC-8: afstanden en radii zonder dubbele waarden', async () => {
    const samen = await roep('vatStijlenSamen', ELEMENTEN);
    const afstanden = waarden(veld(samen, 'afstanden'));

    expect(afstanden).toStrictEqual(['1rem', '0.5rem']);
    expect(new Set(afstanden).size).toBe(afstanden.length);
    expect(veld(samen, 'radii')).toStrictEqual([
      { waarde: '0.5rem', aantal: 2 },
      { waarde: '0.25rem', aantal: 1 },
    ]);
  });

  test('ontwerp-overnemen/AC-8: invoer in een andere volgorde geeft dezelfde uitvoer', async () => {
    const vooruit = await roep('vatStijlenSamen', ELEMENTEN);
    const achteruit = await roep('vatStijlenSamen', [...ELEMENTEN].reverse());
    const gehusseld = await roep('vatStijlenSamen', [ELEMENTEN[1], ELEMENTEN[2], ELEMENTEN[0]]);

    expect(veld(vooruit, 'kleuren')).toBeDefined();
    expect(achteruit).toStrictEqual(vooruit);
    expect(gehusseld).toStrictEqual(vooruit);
  });
});

describe('ontwerp-overnemen/AC-9: uitvoermap en geen Chromium', () => {
  test('ontwerp-overnemen/AC-9: weigert een niet-genegeerde map met de letterlijke melding', async () => {
    const gevraagd: unknown[] = [];
    const isGenegeerd = (pad: unknown) => {
      gevraagd.push(pad);
      return false;
    };
    const resultaat = await roep('uitvoerToegestaan', 'docs/ontwerp', isGenegeerd);

    expect(resultaat).toStrictEqual({ ok: false, code: 2, melding: nietGenegeerd('docs/ontwerp') });
    expect(gevraagd.length).toBeGreaterThan(0);
  });

  test('ontwerp-overnemen/AC-9: aanvaardt een genegeerde map', async () => {
    const resultaat = await roep('uitvoerToegestaan', '.runner-output/ontwerp/ex', () => true);

    expect(resultaat).toStrictEqual({ ok: true });
  });

  test('ontwerp-overnemen/AC-9: een falende launcher geeft exitcode 3 en de melding, zonder bestand', async () => {
    const bron = path.join(tijdelijk, 'voorbeeld.html');
    writeFileSync(bron, '<!doctype html><title>Voorbeeld</title><p>Hallo</p>');
    const uit = path.join(tijdelijk, 'uit');
    const meldingen: string[] = [];
    const launcher = {
      launch: () => Promise.reject(new Error("Executable doesn't exist")),
    };

    const code = await roep('voerUit', [bron, '--naam', 'voorbeeld', '--uit', uit], {
      launcher,
      isGenegeerd: () => true,
      meld: (regel: string) => meldingen.push(regel),
    });

    expect(code).toBe(3);
    expect(meldingen).toContain(GEEN_CHROMIUM);
    expect(existsSync(uit) ? readdirSync(uit, { recursive: true }) : []).toStrictEqual([]);
  });

  // Bij een lokaal bestand lost Chromium geen enkele host op, ook niet via DNS-prefetch buiten page.route om.
  test('ontwerp-overnemen/AC-9: bij een lokaal bestand krijgt launch --host-resolver-rules=MAP * ~NOTFOUND', async () => {
    const bron = path.join(tijdelijk, 'voorbeeld.html');
    writeFileSync(bron, '<!doctype html><title>Voorbeeld</title><p>Hallo</p>');
    const opties: unknown[] = [];
    const launcher = {
      launch: (optie?: unknown) => {
        opties.push(optie);
        return Promise.reject(new Error("Executable doesn't exist"));
      },
    };

    const code = await roep('voerUit', [bron, '--naam', 'voorbeeld', '--uit', path.join(tijdelijk, 'resolver')], {
      launcher,
      isGenegeerd: () => true,
      meld: () => undefined,
    });
    const args = veld(opties[0], 'args');

    expect(code).toBe(3);
    expect(opties).toHaveLength(1);
    expect(Array.isArray(args) ? args.map(String) : []).toContain('--host-resolver-rules=MAP * ~NOTFOUND');
  });

  test('ontwerp-overnemen/AC-9: een niet-genegeerde --uit geeft exitcode 2 zonder de browser te starten', async () => {
    const bron = path.join(tijdelijk, 'voorbeeld.html');
    writeFileSync(bron, '<!doctype html><title>Voorbeeld</title><p>Hallo</p>');
    const uit = path.join(tijdelijk, 'getrackt');
    const meldingen: string[] = [];
    let gestart = false;
    const launcher = {
      launch: () => {
        gestart = true;
        return Promise.reject(new Error('mag niet starten'));
      },
    };

    const code = await roep('voerUit', [bron, '--naam', 'voorbeeld', '--uit', uit], {
      launcher,
      isGenegeerd: () => false,
      meld: (regel: string) => meldingen.push(regel),
    });

    expect(code).toBe(2);
    expect(meldingen).toContain(nietGenegeerd(uit));
    expect(gestart).toBe(false);
    expect(existsSync(uit)).toBe(false);
  });
});

// Netwerkgrenzen van laadBron als pure functies (review van PR #356): symlinks en redirectketens.
describe('ontwerp-overnemen/AC-10: verzoekToegestaan en symlinks', () => {
  const basis = path.join(tijdelijk, 'symlinks');
  const map = path.join(basis, 'bron');
  const bron = path.join(map, 'index.html');
  mkdirSync(map, { recursive: true });
  writeFileSync(bron, '<!doctype html><title>Bron</title>');
  writeFileSync(path.join(basis, 'buiten.css'), 'body { color: red; }');
  writeFileSync(path.join(map, 'echt.css'), 'body { color: blue; }');
  symlinkSync('../buiten.css', path.join(map, 'binnen.css'));
  symlinkSync('bron', path.join(basis, 'via'));
  const url = (pad: string) => pathToFileURL(pad).href;

  test('ontwerp-overnemen/AC-10: een gewoon bestand in de map mag', async () => {
    expect(await roep('verzoekToegestaan', bron, url(path.join(map, 'echt.css')))).toBe(true);
  });

  test('ontwerp-overnemen/AC-10: een symlink in de map die naar buiten wijst, wordt geweigerd', async () => {
    expect(await roep('verzoekToegestaan', bron, url(path.join(map, 'binnen.css')))).toBe(false);
  });

  test('ontwerp-overnemen/AC-10: een bron via een gesymlinkte map mag zijn eigen bestanden laden', async () => {
    const via = path.join(basis, 'via');

    expect(await roep('verzoekToegestaan', path.join(via, 'index.html'), url(path.join(via, 'echt.css')))).toBe(true);
    expect(await roep('verzoekToegestaan', path.join(via, 'index.html'), url(path.join(via, 'binnen.css')))).toBe(
      false,
    );
  });

  test('ontwerp-overnemen/AC-10: een file:-URL met een host wordt geweigerd zonder fout', async () => {
    expect(await roep('verzoekToegestaan', bron, 'file://ontwerp-host/elders.png')).toBe(false);
  });
});

describe('ontwerp-overnemen/AC-10: volgRedirects', () => {
  const BRON = 'https://a.test/';
  type Antwoord = { status: number; headers: Record<string, string> };

  function keten(stappen: Record<string, Antwoord>) {
    const gehaald: string[] = [];
    const haal = (doel: unknown) => {
      const sleutel = String(doel);
      gehaald.push(sleutel);
      const antwoord = stappen[sleutel];
      return antwoord === undefined ? Promise.reject(new Error(`onverwacht ${sleutel}`)) : Promise.resolve(antwoord);
    };
    return { gehaald, haal };
  }

  test('ontwerp-overnemen/AC-10: stopt bij de derde stap naar een andere poort en haalt die niet op', async () => {
    const { gehaald, haal } = keten({
      'https://a.test/x': { status: 302, headers: { location: '/y' } },
      'https://a.test/y': { status: 301, headers: { location: 'https://a.test:8443/z' } },
    });

    const uitkomst = await roep('volgRedirects', BRON, 'https://a.test/x', haal);

    expect(veld(uitkomst, 'toegestaan')).toBe(false);
    expect(veld(uitkomst, 'geblokkeerd')).toStrictEqual(['https://a.test:8443/z']);
    expect(veld(uitkomst, 'antwoord')).toBeUndefined();
    expect(gehaald).toStrictEqual(['https://a.test/x', 'https://a.test/y']);
  });

  test('ontwerp-overnemen/AC-10: een keten binnen de origin geeft het laatste antwoord', async () => {
    const eind = { status: 200, headers: { 'content-type': 'text/css' } };
    const { gehaald, haal } = keten({
      'https://a.test/x': { status: 302, headers: { location: 'y' } },
      'https://a.test/y': { status: 307, headers: { location: 'https://a.test/z' } },
      'https://a.test/z': eind,
    });

    const uitkomst = await roep('volgRedirects', BRON, 'https://a.test/x', haal);

    expect(veld(uitkomst, 'toegestaan')).toBe(true);
    expect(veld(uitkomst, 'antwoord')).toBe(eind);
    expect(veld(uitkomst, 'geblokkeerd')).toStrictEqual([]);
    expect(gehaald).toStrictEqual(['https://a.test/x', 'https://a.test/y', 'https://a.test/z']);
  });

  test('ontwerp-overnemen/AC-10: een eindeloze redirectlus stopt na hoogstens 20 stappen', async () => {
    const { gehaald, haal } = keten({
      'https://a.test/x': { status: 302, headers: { location: '/y' } },
      'https://a.test/y': { status: 302, headers: { location: '/x' } },
    });

    const uitkomst = await roep('volgRedirects', BRON, 'https://a.test/x', haal);

    expect(veld(uitkomst, 'toegestaan')).toBe(false);
    expect(gehaald.length).toBeGreaterThan(1);
    expect(gehaald.length).toBeLessThanOrEqual(20);
  });
});

// Lichte fix (framework §8): haalOp leverde het eindantwoord van een redirectketen onder de oorspronkelijke URL, waardoor
// relatieve URL's na `/docs` → 301 `/docs/` tegen het verkeerde pad oplosten. Contract:
//   volgRedirects geeft bij toegestaan: true ook `url` (de URL die het eindantwoord gaf); op de limiet staat het niet meer
//     opgehaalde doel in `geblokkeerd`.
//   routeAntwoord(verzoekUrl, uitkomst) → { soort: 'afbreken' } | { soort: 'doorverwijzen', url } | { soort: 'leveren' }
//   chromiumArgs(bron) bevat ook --force-webrtc-ip-handling-policy=disable_non_proxied_udp.
describe('ontwerp-overnemen/AC-10: eind-URL van een redirectketen', () => {
  const BRON = 'https://a.test/';
  type Antwoord = { status: number; headers: Record<string, string> };

  function keten(stappen: Record<string, Antwoord>) {
    const gehaald: string[] = [];
    const haal = (doel: unknown) => {
      const sleutel = String(doel);
      gehaald.push(sleutel);
      const antwoord = stappen[sleutel];
      return antwoord === undefined ? Promise.reject(new Error(`onverwacht ${sleutel}`)) : Promise.resolve(antwoord);
    };
    return { gehaald, haal };
  }

  test('ontwerp-overnemen/AC-10: volgRedirects geeft de URL van de laatste stap, zonder redirect de oorspronkelijke', async () => {
    const eind = { status: 200, headers: { 'content-type': 'text/html' } };
    const metKeten = keten({
      'https://a.test/docs': { status: 301, headers: { location: '/docs/' } },
      'https://a.test/docs/': { status: 302, headers: { location: 'start' } },
      'https://a.test/docs/start': eind,
    });
    const zonder = keten({ 'https://a.test/docs/': eind });

    const uitkomst = await roep('volgRedirects', BRON, 'https://a.test/docs', metKeten.haal);
    const direct = await roep('volgRedirects', BRON, 'https://a.test/docs/', zonder.haal);

    expect(veld(uitkomst, 'toegestaan')).toBe(true);
    expect(veld(uitkomst, 'url')).toBe('https://a.test/docs/start');
    expect(veld(uitkomst, 'antwoord')).toBe(eind);
    expect(veld(direct, 'toegestaan')).toBe(true);
    expect(veld(direct, 'url')).toBe('https://a.test/docs/');
  });

  test('ontwerp-overnemen/AC-10: een redirectlus op de limiet noemt het niet meer opgehaalde doel in geblokkeerd', async () => {
    const { gehaald, haal } = keten({
      'https://a.test/x': { status: 302, headers: { location: '/y' } },
      'https://a.test/y': { status: 302, headers: { location: '/x' } },
    });

    const uitkomst = await roep('volgRedirects', BRON, 'https://a.test/x', haal);
    const volgende = gehaald.at(-1) === 'https://a.test/x' ? 'https://a.test/y' : 'https://a.test/x';

    expect(veld(uitkomst, 'toegestaan')).toBe(false);
    expect(gehaald.length).toBeLessThanOrEqual(20);
    expect(veld(uitkomst, 'geblokkeerd')).toStrictEqual([volgende]);
  });

  test('ontwerp-overnemen/AC-10: routeAntwoord breekt af, verwijst door naar de eind-URL of levert', async () => {
    const antwoord = { status: 200, headers: {} };

    expect(
      await roep('routeAntwoord', 'https://a.test/x', { toegestaan: false, geblokkeerd: ['https://b.test/'] }),
    ).toStrictEqual({
      soort: 'afbreken',
    });
    expect(
      await roep('routeAntwoord', 'https://a.test/x', { toegestaan: true, url: 'https://a.test/x', geblokkeerd: [] }),
    ).toStrictEqual({
      soort: 'afbreken',
    });
    expect(
      await roep('routeAntwoord', 'https://a.test/docs', {
        toegestaan: true,
        antwoord,
        url: 'https://a.test/docs/',
        geblokkeerd: [],
      }),
    ).toStrictEqual({ soort: 'doorverwijzen', url: 'https://a.test/docs/' });
    expect(
      await roep('routeAntwoord', 'https://a.test/docs/', {
        toegestaan: true,
        antwoord,
        url: 'https://a.test/docs/',
        geblokkeerd: [],
      }),
    ).toStrictEqual({ soort: 'leveren' });
  });

  test('ontwerp-overnemen/AC-10: chromiumArgs schakelt WebRTC-UDP buiten de proxy uit, lokaal en bij https', async () => {
    const lokaal = await roep('chromiumArgs', path.join(tijdelijk, 'voorbeeld.html'));
    const extern = await roep('chromiumArgs', 'https://a.test/docs/');
    const regel = '--force-webrtc-ip-handling-policy=disable_non_proxied_udp';

    expect(Array.isArray(lokaal) ? lokaal.map(String) : []).toContain(regel);
    expect(Array.isArray(lokaal) ? lokaal.map(String) : []).toContain('--host-resolver-rules=MAP * ~NOTFOUND');
    expect(Array.isArray(extern) ? extern.map(String) : []).toContain(regel);
    expect(Array.isArray(extern) ? extern.map(String) : []).toContain(
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE a.test',
    );
  });
});

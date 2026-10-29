import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Spec ontwerp-overnemen/AC-10: het meetscript in de runner van `pnpm ui:check` (Chromium staat niet in de agent-sandbox).
// De fixture heeft een bekende kaartkleur, familie en radius, een script dat de achtergrond verandert en een externe
// afbeelding. Contract dat deze test vastlegt (voorstel aan de developer, binnen wat de spec noemt):
//   laadBron(page, bron, { js })  bron is een absoluut pad naar een .html-bestand; blokkeert alles behalve file:-verzoeken
//     binnen de map van het bestand → Promise<{ geblokkeerd: string[] }>
//   meetPagina(page) → Promise<{ screenshots: { '375': Buffer, '1280': Buffer }, stijlen }>, met stijlen zoals in
//     stijlen.json zonder bron en geblokkeerd: { breedtes, kleuren: { tekst, vlak, rand }, lettertypen, afstanden, radii }
// JavaScript is een contextoptie: de test maakt de context zelf met javaScriptEnabled en geeft { js } ook mee.
const MODULE = ['../scripts/kit', 'ontwerp-meten.mjs'].join('/');
const FIXTURE = path.join(import.meta.dirname, 'fixtures/ontwerp-voorbeeld.html');
const EXTERN = 'https://ontwerp-voorbeeld.invalid/logo.png';
// Bestaat wel, maar ligt één map hoger dan de fixture: alleen file: binnen de map van de bron mag laden.
const BUITEN = pathToFileURL(path.join(import.meta.dirname, 'buiten-de-map.png')).href;
const ANDERE_HOST = 'file://ontwerp-host/elders.png';
const ONDERRAND = [5, 150, 105] as const;
const KAART = [29, 78, 216] as const;
const SCRIPTKLEUR = [220, 38, 38] as const;

async function functie(naam: string): Promise<(...args: unknown[]) => Promise<unknown>> {
  const geladen: unknown = await import(/* @vite-ignore */ MODULE).catch(() => null);
  expect(geladen, 'scripts/kit/ontwerp-meten.mjs laadt').not.toBeNull();
  const gevonden: unknown = typeof geladen === 'object' && geladen !== null ? Reflect.get(geladen, naam) : undefined;
  expect(typeof gevonden, `${naam} is een geëxporteerde functie`).toBe('function');
  if (typeof gevonden !== 'function') throw new Error(`${naam} ontbreekt`);
  return async (...args) => {
    const resultaat: unknown = await Reflect.apply(gevonden, undefined, args);
    return resultaat;
  };
}

function veld(waarde: unknown, ...sleutels: string[]): unknown {
  let huidig = waarde;
  for (const sleutel of sleutels)
    huidig = typeof huidig === 'object' && huidig !== null ? Reflect.get(huidig, sleutel) : undefined;
  return huidig;
}

function waarden(lijst: unknown): string[] {
  return Array.isArray(lijst) ? lijst.map((item: unknown) => String(veld(item, 'waarde'))) : [];
}

// Referentie: sRGB → OKLab → OKLCH volgens Björn Ottosson, zoals in test/scripts/ontwerp-meten.test.ts.
function referentieOklch([rood, groen, blauw]: readonly [number, number, number]): number[] {
  const lineair = (kanaal: number) => {
    const c = kanaal / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lineair(rood), lineair(groen), lineair(blauw)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lichtheid = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAs = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const tint = (Math.atan2(bAs, a) * 180) / Math.PI;
  return [lichtheid, Math.hypot(a, bAs), tint < 0 ? tint + 360 : tint];
}

function bevatKleur(lijst: unknown, rgb: readonly [number, number, number]): boolean {
  const referentie = referentieOklch(rgb);
  return waarden(lijst).some((waarde) => {
    const match = /^oklch\((\S+) (\S+) (\S+)\)$/.exec(waarde);
    if (match === null) return false;
    // Zonder chroma (wit, zwart, grijs) zegt de tint niets: dan alleen L en C vergelijken.
    const delen = (referentie[1] ?? 0) <= 0.002 ? 2 : 3;
    return [match[1], match[2], match[3]]
      .slice(0, delen)
      .map(Number)
      .every((deel, index) => Math.abs(deel - (referentie[index] ?? Number.NaN)) <= 0.002);
  });
}

// naturalWidth per alt-tekst: 0 betekent dat de afbeelding niet geladen is. Als tekst, want de node-tsconfig kent geen DOM.
async function afbeeldingen(page: Page): Promise<Record<string, number>> {
  const lijst: unknown = await page.evaluate(
    '[...document.images].map((img) => [img.alt, img.complete ? img.naturalWidth : -1])',
  );
  const paren: unknown[] = Array.isArray(lijst) ? lijst : [];
  return Object.fromEntries(
    paren.map((paar) => (Array.isArray(paar) ? [String(paar[0]), Number(paar[1])] : ['', Number.NaN])),
  );
}

async function meet(browser: Browser, js: boolean) {
  const context = await browser.newContext({ javaScriptEnabled: js, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const geladen = await (await functie('laadBron'))(page, FIXTURE, { js });
    const geladenAfbeeldingen = await afbeeldingen(page);
    const gemeten = await (await functie('meetPagina'))(page);
    return { geblokkeerd: veld(geladen, 'geblokkeerd'), gemeten, afbeeldingen: geladenAfbeeldingen };
  } finally {
    await context.close();
  }
}

function pngGrootte(waarde: unknown): number {
  if (!Buffer.isBuffer(waarde)) return 0;
  // PNG-handtekening: \x89PNG
  return waarde.subarray(0, 4).toString('latin1') === '\u0089PNG' ? waarde.length : 0;
}

test.describe('ontwerp-meten op een lokale fixture', () => {
  test('ontwerp-overnemen/AC-10: screenshots op 375 en 1280 px en stijlen met kleur, familie en radius', async ({
    browser,
  }) => {
    const { gemeten } = await meet(browser, false);

    expect(pngGrootte(veld(gemeten, 'screenshots', '375'))).toBeGreaterThan(0);
    expect(pngGrootte(veld(gemeten, 'screenshots', '1280'))).toBeGreaterThan(0);
    expect(veld(gemeten, 'stijlen', 'breedtes')).toStrictEqual([375, 1280]);
    expect(bevatKleur(veld(gemeten, 'stijlen', 'kleuren', 'vlak'), KAART)).toBe(true);
    expect(waarden(veld(gemeten, 'stijlen', 'lettertypen', 'families'))).toContain('Voorbeeldletter, serif');
    expect(waarden(veld(gemeten, 'stijlen', 'radii'))).toContain('0.75rem');
  });

  test('ontwerp-overnemen/AC-10: de externe afbeelding staat onder geblokkeerd', async ({ browser }) => {
    const { geblokkeerd } = await meet(browser, false);

    expect(geblokkeerd).toContain(EXTERN);
  });

  test('ontwerp-overnemen/AC-10: een bestand buiten de map van de bron is geblokkeerd en niet geladen', async ({
    browser,
  }) => {
    const { geblokkeerd, afbeeldingen: geladen } = await meet(browser, false);

    expect(geblokkeerd).toContain(BUITEN);
    expect(geladen['Buiten de map']).toBe(0);
    // Tegenproef: binnen de map laadt wel, dus 0 hierboven komt van de blokkade.
    expect(geladen['Binnen de map']).toBeGreaterThan(0);
    expect(geblokkeerd).not.toContain(
      pathToFileURL(path.join(import.meta.dirname, 'fixtures/ontwerp-binnen.png')).href,
    );
  });

  test('ontwerp-overnemen/AC-10: een file:-URL met een host wordt geweigerd zonder fout', async ({ browser }) => {
    const { geblokkeerd, afbeeldingen: geladen } = await meet(browser, false);

    expect(geblokkeerd).toContain(ANDERE_HOST);
    expect(geladen['Andere host']).toBe(0);
  });

  test('ontwerp-overnemen/AC-10: een element met alleen een onderrand telt die kleur onder rand', async ({
    browser,
  }) => {
    const { gemeten } = await meet(browser, false);

    expect(bevatKleur(veld(gemeten, 'stijlen', 'kleuren', 'rand'), ONDERRAND)).toBe(true);
  });

  test('ontwerp-overnemen/AC-10: voerUit met Chromium schrijft 375.png, 1280.png en stijlen.json', async ({
    playwright,
  }, testInfo) => {
    const uit = testInfo.outputPath('x');
    const meldingen: string[] = [];

    const code = await (
      await functie('voerUit')
    )([FIXTURE, '--naam', 'x', '--uit', uit], {
      launcher: playwright.chromium,
      isGenegeerd: () => true,
      meld: (regel: string) => meldingen.push(regel),
    });

    expect(code, meldingen.join('\n')).toBe(0);
    for (const png of ['375.png', '1280.png']) expect(statSync(path.join(uit, png)).size).toBeGreaterThan(0);
    const json: unknown = JSON.parse(readFileSync(path.join(uit, 'stijlen.json'), 'utf8'));
    const gemeten = String(veld(json, 'gemeten'));
    expect(String(veld(json, 'bron'))).toMatch(/ontwerp-voorbeeld\.html$/);
    expect(new Date(gemeten).toISOString()).toBe(gemeten);
    expect(veld(json, 'geblokkeerd')).toContain(EXTERN);
    expect(veld(json, 'breedtes')).toStrictEqual([375, 1280]);
    expect(bevatKleur(veld(json, 'kleuren', 'vlak'), KAART)).toBe(true);
  });

  test('ontwerp-overnemen/AC-10: de achtergrond uit het script komt alleen met --js voor', async ({ browser }) => {
    const zonder = await meet(browser, false);
    const met = await meet(browser, true);

    expect(bevatKleur(veld(zonder.gemeten, 'stijlen', 'kleuren', 'vlak'), [255, 255, 255])).toBe(true);
    expect(bevatKleur(veld(zonder.gemeten, 'stijlen', 'kleuren', 'vlak'), SCRIPTKLEUR)).toBe(false);
    expect(bevatKleur(veld(met.gemeten, 'stijlen', 'kleuren', 'vlak'), SCRIPTKLEUR)).toBe(true);
  });
});

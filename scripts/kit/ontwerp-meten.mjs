// Meetscript voor de skill ontwerp-overnemen (docs/specs/ontwerp-overnemen.md): screenshots op 375 en 1280 px en een
// samenvatting van de berekende stijlen van een ontwerpreferentie, als basis voor thematokens.
// Gebruik: node scripts/kit/ontwerp-meten.mjs <bron.html|https-url> --naam <bron> [--js] [--uit <map>]
// Uitvoer in --uit (standaard .runner-output/ontwerp/<naam>/, door git genegeerd): 375.png, 1280.png en stijlen.json.
// Exitcodes: 0 klaar, 2 ongeldige invoer, 3 geen Chromium. Chromium komt lazy uit @playwright/test (geen nieuwe
// dependency); JavaScript staat standaard uit en elk verzoek buiten de bron wordt afgebroken en onder `geblokkeerd` gelogd.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';

export const GEBRUIK =
  'Gebruik: node scripts/kit/ontwerp-meten.mjs <bron.html|https-url> --naam <bron> [--js] [--uit <map>]';
export const ONGELDIGE_NAAM = "Ongeldige --naam: alleen kleine letters, cijfers en '-'.";
export const ALLEEN_HTML = 'Alleen een lokaal .html-bestand of een https-URL.';
export const GEEN_CHROMIUM =
  'Geen Chromium beschikbaar: lees de bron statisch (skill ontwerp-overnemen) of draai op een apparaat met Playwright-browsers.';
/** @param {string} map */
export const nietGenegeerd = (map) =>
  `Uitvoermap ${map} is niet door git genegeerd; screenshots horen niet in de repo.`;

const NAAM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BREEDTES = [375, 1280];
const HOOGTE = 900;
const REM = 16;

/** @typedef {{ waarde: string, aantal: number }} Telling */
/** @typedef {Record<string, string>} Element berekende stijlen van één zichtbaar element, in camelCase */
/** @typedef {{ bron: string, naam: string, js: boolean, uit: string }} Opties */
/** @typedef {{ ok: false, code: 2, melding: string }} Weigering */

/** @param {string} melding @returns {Weigering} */
const weiger = (melding) => ({ ok: false, code: 2, melding });

/** Een https-URL wordt genormaliseerd, een lokaal .html-bestand absoluut; al het andere is null. @param {string} bron */
function normaliseerBron(bron) {
  if (/^[a-z][a-z0-9+.-]+:/i.test(bron)) {
    if (!URL.canParse(bron)) return null;
    const url = new URL(bron);
    return url.protocol === 'https:' ? url.href : null;
  }
  return /\.html?$/i.test(bron) ? path.resolve(bron) : null;
}

/** @param {string[]} argv */
function leesArgv(argv) {
  try {
    return nodeParseArgs({
      args: argv,
      options: { naam: { type: 'string' }, uit: { type: 'string' }, js: { type: 'boolean' } },
      allowPositionals: true,
      strict: true,
    });
  } catch {
    return null;
  }
}

/**
 * Leest de argumenten zonder node en script (process.argv.slice(2)); controleert niet of de bron bestaat.
 * @param {string[]} argv
 * @returns {{ ok: true, opties: Opties } | Weigering}
 */
export function parseArgs(argv) {
  const gelezen = leesArgv(argv);
  if (gelezen === null) return weiger(GEBRUIK);
  const { values, positionals } = gelezen;
  const [ruweBron] = positionals;
  if (positionals.length !== 1 || ruweBron === undefined || values.naam === undefined) return weiger(GEBRUIK);
  if (!NAAM.test(values.naam)) return weiger(ONGELDIGE_NAAM);
  const bron = normaliseerBron(ruweBron);
  if (bron === null) return weiger(ALLEEN_HTML);
  const uit = values.uit ?? path.join('.runner-output', 'ontwerp', values.naam);
  return { ok: true, opties: { bron, naam: values.naam, js: values.js === true, uit } };
}

/** @param {number} getal */
const rond = (getal) => Number(getal.toFixed(3));

/** @param {number} kanaal 0..255 */
function lineair(kanaal) {
  const c = kanaal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB → OKLab → OKLCH (Björn Ottosson). @param {number[]} rgb @returns {[number, number, number]} */
function oklch([rood = 0, groen = 0, blauw = 0]) {
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

/**
 * `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (komma's of spaties) → [r, g, b, alfa].
 * @param {string} css
 * @returns {[number, number, number, number] | null}
 */
function leesRgb(css) {
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(css)?.[1];
  if (hex !== undefined) {
    const vol = hex.length <= 4 ? [...hex].map((teken) => teken + teken).join('') : hex;
    const delen = (vol.match(/../g) ?? []).map((paar) => Number.parseInt(paar, 16));
    return [delen[0] ?? 0, delen[1] ?? 0, delen[2] ?? 0, delen.length === 4 ? (delen[3] ?? 255) / 255 : 1];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(css);
  if (rgb === null) return null;
  const alfa = rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]) / (rgb[4].endsWith('%') ? 100 : 1);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alfa];
}

/**
 * Een CSS-kleur als `oklch(L C H)` (drie decimalen, met alfa `/ a`); volledig transparant of onleesbaar is null.
 * Een kleur die de browser al als `oklch(…)` geeft, blijft zoals hij is.
 * @param {string} css
 */
export function naarOklch(css) {
  const invoer = css.trim().toLowerCase();
  if (invoer.startsWith('oklch(')) return invoer;
  const rgba = invoer === 'transparent' ? null : leesRgb(invoer);
  if (rgba === null || rgba[3] <= 0) return null;
  const [l, c, h] = oklch(rgba);
  const chroma = rond(c);
  const tint = chroma === 0 ? 0 : rond(h) % 360;
  const alfa = rgba[3] < 1 ? ` / ${String(rond(rgba[3]))}` : '';
  return `oklch(${String(rond(l))} ${String(chroma)} ${String(tint)}${alfa})`;
}

/** `16px` → `1rem`; `0px`, `auto` en `normal` tellen niet mee. @param {string} waarde */
function naarRem(waarde) {
  if (waarde === '' || waarde === 'auto' || waarde === 'normal') return null;
  const px = /^(-?[\d.]+)px$/.exec(waarde)?.[1];
  if (px === undefined) return waarde;
  const rem = Number((Number(px) / REM).toFixed(4));
  return rem === 0 ? null : `${String(rem)}rem`;
}

/** `"Inter", sans-serif` → `Inter, sans-serif`. @param {string} familie */
const zonderAanhalingstekens = (familie) =>
  familie
    .split(',')
    .map((deel) => deel.trim().replace(/^["']|["']$/g, ''))
    .filter((deel) => deel !== '')
    .join(', ');

/** Shorthand zoals `16px 8px` of `8px / 4px` in losse waarden. @param {string | undefined} waarde */
const delen = (waarde) => (waarde ?? '').split(/[\s/]+/).filter((deel) => deel !== '');

/** Telt waarden en sorteert aflopend op aantal, dan op waarde. @param {(string | null)[]} lijst @returns {Telling[]} */
function tel(lijst) {
  /** @type {Map<string, number>} */
  const aantallen = new Map();
  for (const waarde of lijst) if (waarde !== null) aantallen.set(waarde, (aantallen.get(waarde) ?? 0) + 1);
  return [...aantallen]
    .map(([waarde, aantal]) => ({ waarde, aantal }))
    .sort((a, b) => b.aantal - a.aantal || (a.waarde < b.waarde ? -1 : a.waarde > b.waarde ? 1 : 0));
}

/**
 * Vat de berekende stijlen van zichtbare elementen samen; de volgorde van de invoer doet er niet toe.
 * @param {Element[]} elementen
 */
export function vatStijlenSamen(elementen) {
  /** @param {string} sleutel */
  const kolom = (sleutel) => elementen.map((element) => element[sleutel] ?? '');
  const kleur = (/** @type {string} */ sleutel) => tel(kolom(sleutel).map(naarOklch));
  const afstanden = ['padding', 'margin', 'gap'].flatMap((sleutel) => kolom(sleutel).flatMap(delen));
  return {
    kleuren: { tekst: kleur('color'), vlak: kleur('backgroundColor'), rand: kleur('borderColor') },
    lettertypen: {
      families: tel(kolom('fontFamily').map((familie) => zonderAanhalingstekens(familie) || null)),
      maten: tel(kolom('fontSize').map(naarRem)),
      gewichten: tel(kolom('fontWeight').map((gewicht) => gewicht || null)),
      regelhoogtes: tel(kolom('lineHeight').map((hoogte) => (hoogte === 'normal' ? hoogte : naarRem(hoogte)))),
    },
    afstanden: tel(afstanden.map(naarRem)),
    radii: tel(kolom('borderRadius').flatMap(delen).map(naarRem)),
  };
}

/**
 * Een uitvoermap moet door git genegeerd zijn: screenshots van referenties horen niet in de repo (OV-1).
 * @param {string} pad
 * @param {(pad: string) => boolean} isGenegeerd
 * @returns {{ ok: true } | Weigering}
 */
export function uitvoerToegestaan(pad, isGenegeerd) {
  return isGenegeerd(pad) ? { ok: true } : weiger(nietGenegeerd(pad));
}

/** @param {string} pad */
function gitNegeert(pad) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', pad], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Mag dit verzoek door? Bij een bestand alleen file: binnen de map, bij een URL alleen dezelfde origin. */
function verzoekToegestaan(/** @type {string} */ bron, /** @type {string} */ url) {
  if (bron.startsWith('https:')) return URL.canParse(url) && new URL(url).origin === new URL(bron).origin;
  if (!url.startsWith('file:')) return false;
  const relatief = path.relative(path.dirname(bron), fileURLToPath(url));
  return !relatief.startsWith('..') && !path.isAbsolute(relatief);
}

/**
 * Laadt de bron in een bestaande page. JavaScript is een contextoptie (`javaScriptEnabled`); zonder `js` worden ook
 * scriptbestanden afgebroken. Elk afgebroken verzoek staat in `geblokkeerd`.
 * @param {import('@playwright/test').Page} page
 * @param {string} bron absoluut pad naar een .html-bestand of een https-URL
 * @param {{ js: boolean }} opties
 * @returns {Promise<{ geblokkeerd: string[] }>}
 */
export async function laadBron(page, bron, { js }) {
  /** @type {Set<string>} */
  const geblokkeerd = new Set();
  await page.route('**/*', async (route) => {
    const verzoek = route.request();
    const script = !js && verzoek.resourceType() === 'script';
    if (!script && verzoekToegestaan(bron, verzoek.url())) return route.continue();
    geblokkeerd.add(verzoek.url());
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket(/.*/, (socket) => {
    geblokkeerd.add(socket.url());
    return socket.close();
  });
  await page.goto(bron.startsWith('https:') ? bron : pathToFileURL(bron).href, { waitUntil: 'load' });
  return { geblokkeerd: [...geblokkeerd].sort() };
}

// Draait in de browser (als tekst, want de node-tsconfig kent geen DOM): berekende stijlen van zichtbare elementen.
// Een rand telt alleen mee als hij breedte heeft; anders zou currentColor elke tekstkleur als randkleur tellen.
const ELEMENTEN_IN_BROWSER = `[...document.querySelectorAll('body, body *')]
  .filter((el) => el.checkVisibility() && el.getBoundingClientRect().width > 0)
  .map((el) => {
    const s = getComputedStyle(el);
    const rand = parseFloat(s.borderTopWidth) > 0 ? s.borderTopColor : 'transparent';
    return { color: s.color, backgroundColor: s.backgroundColor, borderColor: rand, fontFamily: s.fontFamily,
      fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, padding: s.padding,
      margin: s.margin, gap: s.gap, borderRadius: s.borderRadius };
  })`;

/**
 * Meet de geladen pagina op elke breedte: een screenshot van de hele pagina en de berekende stijlen, samengevat.
 * @param {import('@playwright/test').Page} page
 */
export async function meetPagina(page) {
  /** @type {Record<string, Buffer>} */
  const screenshots = {};
  /** @type {Element[]} */
  const elementen = [];
  for (const breedte of BREEDTES) {
    await page.setViewportSize({ width: breedte, height: HOOGTE });
    screenshots[String(breedte)] = await page.screenshot({ fullPage: true });
    /** @type {Element[]} */
    const gemeten = await page.evaluate(ELEMENTEN_IN_BROWSER);
    elementen.push(...gemeten);
  }
  return { screenshots, stijlen: { breedtes: BREEDTES, ...vatStijlenSamen(elementen) } };
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {Opties} opties
 */
async function meetEnSchrijf(browser, { bron, js, uit }) {
  const context = await browser.newContext({
    javaScriptEnabled: js,
    viewport: { width: BREEDTES[0] ?? 375, height: HOOGTE },
  });
  const page = await context.newPage();
  const { geblokkeerd } = await laadBron(page, bron, { js });
  const { screenshots, stijlen } = await meetPagina(page);
  mkdirSync(uit, { recursive: true });
  for (const [breedte, png] of Object.entries(screenshots)) writeFileSync(path.join(uit, `${breedte}.png`), png);
  const json = { bron, gemeten: new Date().toISOString(), ...stijlen, geblokkeerd };
  writeFileSync(path.join(uit, 'stijlen.json'), `${JSON.stringify(json, null, 2)}\n`);
}

/**
 * De CLI als functie, met de browser en git geïnjecteerd voor tests; geeft de exitcode.
 * @param {string[]} argv
 * @param {{ launcher: { launch(): Promise<import('@playwright/test').Browser> }, isGenegeerd: (pad: string) => boolean, meld: (regel: string) => void }} deps
 */
export async function voerUit(argv, { launcher, isGenegeerd, meld }) {
  const gelezen = parseArgs(argv);
  const toegestaan = gelezen.ok ? uitvoerToegestaan(gelezen.opties.uit, isGenegeerd) : gelezen;
  if (!toegestaan.ok) {
    meld(toegestaan.melding);
    return toegestaan.code;
  }
  if (!gelezen.ok) return 2;
  const { opties } = gelezen;
  if (!opties.bron.startsWith('https:') && !existsSync(opties.bron)) {
    meld(ALLEEN_HTML);
    return 2;
  }
  /** @type {import('@playwright/test').Browser} */
  let browser;
  try {
    browser = await launcher.launch();
  } catch {
    meld(GEEN_CHROMIUM);
    return 3;
  }
  try {
    await meetEnSchrijf(browser, opties);
  } finally {
    await browser.close();
  }
  meld(`✓ ${path.join(opties.uit, '375.png')}, 1280.png en stijlen.json`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await voerUit(process.argv.slice(2), {
    // Lazy: zonder Playwright-browsers (agent-sandbox) faalt alleen deze stap, met exitcode 3.
    launcher: { launch: async () => (await import('@playwright/test')).chromium.launch() },
    isGenegeerd: gitNegeert,
    meld: (regel) => {
      console.error(regel);
    },
  });
}

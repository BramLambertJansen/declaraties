// check-koppelingsvorm (spec koppelingsvorm, Check; ADR 0077 punt 2): elke koppeling staat in src/api/integrations/<naam>/
// met precies port.ts, adapter.ts, schemas.ts, contract.test.ts en fixtures/, en elke map hoort bij een naam in het register.
// Pure functies zoals check-policies.mjs; test/rails/koppelingsvorm.test.ts roept ze aan met integrations.names, zodat dit
// script zelf geen .ts laadt. Namen die met `.` beginnen telt de check nergens mee.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = 'src/api/integrations';
const NAAM = /^[a-z][a-z0-9-]*$/;
/** @type {Readonly<Record<string, Soort>>} */
const ONDERDELEN = {
  'port.ts': 'bestand',
  'adapter.ts': 'bestand',
  'schemas.ts': 'bestand',
  'contract.test.ts': 'bestand',
  fixtures: 'map',
};

/** @typedef {'map' | 'bestand' | 'symlink'} Soort */
/**
 * @typedef {object} Item
 * @property {string} naam
 * @property {Soort} soort
 * @property {{ naam: string, soort: Soort }[]} onderdelen eerste niveau, zonder verborgen namen
 * @property {string[]} symlinks paden (relatief aan de map) van elke symlink eronder
 * @property {number} fixtures aantal bestanden in fixtures/, recursief, zonder verborgen namen en symlinks
 * @property {string | null} contract tekst van contract.test.ts, of null
 */

/** @param {import('node:fs').Dirent} entry @returns {Soort} */
const soortVan = (entry) => (entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'map' : 'bestand');

/** @param {string} dir */
const zichtbaar = (dir) => readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith('.'));

/**
 * Loopt een map recursief af (volgt geen symlinks).
 * @param {string} dir @param {string} rel @returns {{ symlinks: string[], bestanden: number }}
 */
function loop(dir, rel) {
  const uitkomst = { symlinks: /** @type {string[]} */ ([]), bestanden: 0 };
  for (const entry of zichtbaar(dir)) {
    const pad = rel === '' ? entry.name : `${rel}/${entry.name}`;
    const soort = soortVan(entry);
    if (soort === 'symlink') uitkomst.symlinks.push(pad);
    else if (soort === 'bestand') uitkomst.bestanden += 1;
    else {
      const onder = loop(path.join(dir, entry.name), pad);
      uitkomst.symlinks.push(...onder.symlinks);
      uitkomst.bestanden += onder.bestanden;
    }
  }
  return uitkomst;
}

/** @param {string} dir @param {string} naam @returns {Item} */
function mapItem(dir, naam) {
  const onderdelen = zichtbaar(dir).map((entry) => ({ naam: entry.name, soort: soortVan(entry) }));
  const soortVanDeel = (/** @type {string} */ deel) => onderdelen.find((o) => o.naam === deel)?.soort;
  const contractPad = path.join(dir, 'contract.test.ts');
  return {
    naam,
    soort: 'map',
    onderdelen,
    symlinks: loop(dir, '').symlinks,
    fixtures: soortVanDeel('fixtures') === 'map' ? loop(path.join(dir, 'fixtures'), 'fixtures').bestanden : 0,
    contract: soortVanDeel('contract.test.ts') === 'bestand' ? readFileSync(contractPad, 'utf8') : null,
  };
}

/**
 * Alles onder src/api/integrations behalve index.ts en verborgen namen; ontbreekt de map, dan [].
 * @param {string} [root] @returns {Item[]}
 */
export function koppelingsmappen(root = '.') {
  const dir = path.join(root, DIR);
  if (!existsSync(dir)) return [];
  return zichtbaar(dir)
    .filter((entry) => !(entry.name === 'index.ts' && soortVan(entry) === 'bestand'))
    .map((entry) => {
      const soort = soortVan(entry);
      if (soort === 'map') return mapItem(path.join(dir, entry.name), entry.name);
      return { naam: entry.name, soort, onderdelen: [], symlinks: [], fixtures: 0, contract: null };
    });
}

/** @param {Item} item @returns {string[]} */
function vormFouten(item) {
  const map = `${DIR}/${item.naam}`;
  const fouten = item.symlinks.map((pad) => `${map}/${pad}: symlink; gebruik een gewoon bestand of een gewone map`);
  const symlinks = new Set(item.symlinks);
  for (const [deel, soort] of Object.entries(ONDERDELEN)) {
    const gevonden = item.onderdelen.find((o) => o.naam === deel);
    if (gevonden === undefined) fouten.push(`${map}: ${deel} ontbreekt (vaste vorm: spec koppelingsvorm)`);
    else if (gevonden.soort !== soort && !symlinks.has(deel)) {
      fouten.push(`${map}: ${deel} moet een ${soort} zijn, niet een ${gevonden.soort}`);
    }
  }
  for (const onderdeel of item.onderdelen) {
    if (!(onderdeel.naam in ONDERDELEN) && !symlinks.has(onderdeel.naam))
      fouten.push(`${map}: ${onderdeel.naam} hoort niet in de vaste vorm`);
  }
  const fixtures = item.onderdelen.find((o) => o.naam === 'fixtures');
  if (fixtures?.soort === 'map' && item.fixtures === 0) fouten.push(`${map}: fixtures zonder bestand`);
  return [...fouten, ...contractFouten(item, map)];
}

/** @param {Item} item @param {string} map @returns {string[]} */
function contractFouten(item, map) {
  if (item.contract === null) return [];
  const fouten = [];
  if (!item.contract.includes('describeContract('))
    fouten.push(`${map}/contract.test.ts: roept describeContract( niet aan`);
  if (!item.contract.includes(`'${item.naam}'`) && !item.contract.includes(`"${item.naam}"`)) {
    fouten.push(`${map}/contract.test.ts: noemt de mapnaam '${item.naam}' niet als letterlijke tekst`);
  }
  return fouten;
}

/**
 * Een fout per afwijking van de vaste vorm.
 * @param {{ items: readonly Item[], names: readonly string[] }} input names: de geregistreerde namen
 * @returns {string[]}
 */
export function koppelingsvormFouten({ items, names }) {
  const fouten = [];
  for (const item of items) {
    const pad = `${DIR}/${item.naam}`;
    if (item.soort === 'symlink') fouten.push(`${pad}: symlink; gebruik een gewone map`);
    else if (item.soort === 'bestand') fouten.push(`${pad}: los bestand; alleen index.ts en een map per koppeling`);
    else {
      if (!NAAM.test(item.naam)) fouten.push(`${pad}: mapnaam buiten het patroon ${String(NAAM)}`);
      if (!names.includes(item.naam)) fouten.push(`${pad}: niet geregistreerd in ${DIR}/index.ts`);
      fouten.push(...vormFouten(item));
    }
  }
  const mappen = new Set(items.filter((item) => item.soort === 'map').map((item) => item.naam));
  for (const name of names) {
    if (!mappen.has(name))
      fouten.push(`${DIR}/${name}: geregistreerd maar zonder map (vaste vorm: spec koppelingsvorm)`);
  }
  return fouten;
}

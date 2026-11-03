// De feiten-aanroepen van een leespad (meting-stuurt/AC-4): afgeleid uit de bestanden van het scenario zelf, zodat een nieuwe
// aanroep vanzelf meetelt. Telt: elke injectie !`node scripts/kit/feiten.mjs <secties>` en de eerste aanroep tussen backticks in
// een regel die begint met "1. Begin met de feiten" (agentbestanden) of "- Begin met taakrelevante feiten" (AGENTS.md).
// `hoofdstuk <n>` en een kale aanroep tellen niet (het regelboek telt leespad.mjs zelf). De secties van alle aanroepen samen
// tellen één keer; één `--alle` geldt voor het geheel. `specs`, `adr` en `fase` komen uit de lezer (werkmap of basis), de
// secties uit code en de regel `volgende` van `adr` altijd uit de werkmap, zodat ze in het verschil met de basis wegvallen.
// Getest in test/rails/meting-stuurt-leespad.test.ts.
import { Buffer } from 'node:buffer';

const INJECTIE = /!`node scripts\/kit\/feiten\.mjs([^`]*)`/g;
const AANROEP = /`node scripts\/kit\/feiten\.mjs([^`]*)`/;
const BEGIN = /^(?:\d+\. Begin met de feiten|- Begin met taakrelevante feiten)/;

/** @typedef {{ secties: string[], alle: boolean }} Aanroep */
/** @typedef {import('./feiten-secties.mjs').Lezer} Lezer */

/** Een herkende aanroep; `hoofdstuk <n>` en een kale aanroep tellen mee als herkend, zonder secties. @param {string} args @returns {Aanroep} */
function aanroep(args) {
  const woorden = args.trim().split(/\s+/).filter(Boolean);
  if (woorden[0] === 'hoofdstuk') return { secties: [], alle: false };
  return { secties: woorden.filter((woord) => !woord.startsWith('-')), alle: woorden.includes('--alle') };
}

/**
 * De aanroepen in een tekst, en de regels die een aanroep vragen maar er geen opleveren (een aanroep buiten backticks).
 * @param {string} tekst
 * @returns {{ aanroepen: Aanroep[], zonder: number[] }}
 */
export function feitenAanroepen(tekst) {
  /** @type {Aanroep[]} */
  const aanroepen = [];
  /** @type {number[]} */
  const zonder = [];
  tekst.split('\n').forEach((regel, index) => {
    const injecties = [...regel.matchAll(INJECTIE)].map(([, args = '']) => aanroep(args));
    const begin = BEGIN.test(regel) ? AANROEP.exec(regel) : null;
    const gevonden = [...injecties, ...(begin === null ? [] : [aanroep(begin[1] ?? '')])];
    const vraagt = BEGIN.test(regel) || regel.includes('!`node scripts/kit/feiten');
    for (const a of gevonden) if (a.secties.length > 0) aanroepen.push(a);
    if (vraagt && gevonden.length === 0) zonder.push(index + 1);
  });
  return { aanroepen, zonder };
}

/**
 * De samengevoegde aanroep van een scenario over zijn bestanden, in volgorde van eerste verschijnen.
 * @param {readonly string[]} paden @param {(pad: string) => string | Buffer | null} lees
 * @returns {Aanroep & { zonder: string[] }}
 */
export function scenarioFeiten(paden, lees) {
  /** @type {Set<string>} */
  const secties = new Set();
  let alle = false;
  /** @type {string[]} */
  const zonder = [];
  for (const pad of paden) {
    const inhoud = lees(pad);
    if (inhoud === null) continue;
    const uit = feitenAanroepen(inhoud.toString());
    for (const a of uit.aanroepen) {
      for (const sectie of a.secties) secties.add(sectie);
      alle ||= a.alle;
    }
    zonder.push(...uit.zonder.map((regel) => `${pad}:${String(regel)}`));
  }
  return { secties: [...secties], alle, zonder };
}

/**
 * De werkmapkant van de feiten (secties uit code en het volgende ADR-nummer), één keer berekend en gedeeld door werkmap en
 * basis. Een fout komt terug als reden, nooit als 0 bytes.
 */
export function werkmapCode() {
  /** @type {Map<string, Promise<unknown>>} */
  const cache = new Map();
  /** @param {string} sleutel @param {() => Promise<unknown>} maak */
  const eens = (sleutel, maak) => {
    if (!cache.has(sleutel)) cache.set(sleutel, maak());
    return /** @type {Promise<unknown>} */ (cache.get(sleutel));
  };
  return {
    /** @param {string} naam */
    sectie: (naam) =>
      eens(naam, async () => {
        const { codeSecties } = await import('./feiten-secties.mjs');
        const laad = codeSecties[naam];
        if (laad === undefined) throw new Error(`onbekende sectie ${naam}`);
        const { kop, inhoud } = await laad();
        return kop === undefined ? { inhoud } : { kop, inhoud };
      }),
    /** @param {boolean} alle */
    volgende: (alle) =>
      eens(`volgende:${String(alle)}`, async () => {
        const { gereserveerdeAdrNummers, lezerSecties, werkmap } = await import('./feiten-secties.mjs');
        const adr = lezerSecties(werkmap, { alle, gereserveerd: await gereserveerdeAdrNummers() }).adr();
        return /** @type {{ volgende: string }} */ (adr).volgende;
      }),
  };
}

/**
 * Bytes van de feiten-uitvoer van een aanroep, zoals `node scripts/kit/feiten.mjs <secties>` hem afdrukt.
 * @param {Aanroep} a @param {Lezer} lezer @param {ReturnType<typeof werkmapCode>} code
 * @returns {Promise<{ bytes: number } | { bytes: null, reden: string }>}
 */
export async function feitenBytes({ secties, alle }, lezer, code) {
  if (secties.length === 0) return { bytes: 0 };
  try {
    const [{ toText }, { lezerSecties, LEZER_SECTIES }] = await Promise.all([
      import('./feiten-tekst.mjs'),
      import('./feiten-secties.mjs'),
    ]);
    const volgende = secties.includes('adr') ? String(await code.volgende(alle)) : undefined;
    const uitLezer = lezerSecties(lezer, { alle, ...(volgende === undefined ? {} : { volgende }) });
    const delen = await Promise.all(
      secties.map(async (naam) => {
        const eigen = /** @type {Record<string, () => unknown>} */ (uitLezer)[naam];
        if (LEZER_SECTIES.some((s) => s === naam) && eigen !== undefined) return { naam, inhoud: eigen() };
        return { naam, .../** @type {{ kop?: string, inhoud: unknown }} */ (await code.sectie(naam)) };
      }),
    );
    // console.info in feiten.mjs sluit af met een regeleinde.
    return { bytes: Buffer.byteLength(`${toText(delen)}\n`) };
  } catch (fout) {
    return { bytes: null, reden: fout instanceof Error ? fout.message : String(fout) };
  }
}

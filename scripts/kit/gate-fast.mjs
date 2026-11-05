// gate:fast (framework §4, ADR 0045): draait de snelle gates uit het register (scripts/kit/gates.mjs) in drie banen:
// test:unit en lint (de twee langste) elk apart, de rest na elkaar in de derde. Bij weinig beschikbaar geheugen delen de
// zware gates een wachtrij; geen check wordt overgeslagen of anders aangeroepen. Gemeten op 16 cores (2026-10-22): 92 s na
// elkaar, 71 s alles tegelijk (CPU-druk), 61 s in drie banen. Elke gate is een eigen `pnpm <script>` met dezelfde
// exitcode als los; de uitvoer wordt gebufferd: eerst die van de rode gates, dan de lijst, beide in registervolgorde. Anders dan de oude &&-keten
// stopt een rode gate de andere niet, zodat één ronde alle fouten laat zien.
// In CI draait de suite in drie delen naast elkaar (`--deel`, ADR 0076, spec ci-in-delen): `checks` (alles behalve
// test:unit) en `test-1`/`test-2` (elk de helft van test:unit via `vitest --shard`). Zonder `--deel` draait alles.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { gates } from './gates.mjs';
import { weinigGeheugen } from './geheugen.mjs';

/** @typedef {{ script: string, code: number, output: string, seconds: number }} Uitslag */
/** @typedef {{ scripts: readonly string[], args: Readonly<Record<string, readonly string[]>> }} Deel */

/** Gates met een eigen baan; de rest deelt de laatste baan. */
const EIGEN_BAAN = new Set(['test:unit', 'lint']);

/** De snelle gates, in de volgorde van het register. */
export function snelleGates() {
  return gates.filter((gate) => gate.snel).map((gate) => gate.script);
}

/** De delen van de snelle suite in CI (ADR 0076 punt 3); `check:new-resource` gebruikt dezelfde. */
export const DELEN = Object.freeze(['checks', 'test-1', 'test-2']);

/**
 * Wat een deel draait: de scripts en de extra argumenten per script. Null voor een onbekend deel.
 * @param {string} naam
 * @param {readonly string[]} [alle] de snelle gates
 * @returns {Deel | null}
 */
export function deel(naam, alle = snelleGates()) {
  if (naam === 'checks') return { scripts: alle.filter((script) => script !== 'test:unit'), args: {} };
  const helft = /^test-([12])$/.exec(naam)?.[1];
  if (helft === undefined || !alle.includes('test:unit')) return null;
  return { scripts: ['test:unit'], args: { 'test:unit': [`--shard=${helft}/2`] } };
}

/**
 * @param {readonly string[]} scripts
 * @returns {string[][]}
 */
export function banen(scripts) {
  const eigen = scripts.filter((script) => EIGEN_BAAN.has(script)).map((script) => [script]);
  const rest = scripts.filter((script) => !EIGEN_BAAN.has(script));
  return [...eigen, ...(rest.length === 0 ? [] : [rest])];
}

/**
 * @param {string} script
 * @param {readonly string[]} [args]
 * @returns {Promise<Uitslag>}
 */
function draai(script, args = []) {
  const start = performance.now();
  return new Promise((resolve) => {
    const child = spawn('pnpm', [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const klaar = (/** @type {number} */ code) =>
      resolve({ script, code, output: Buffer.concat(chunks).toString(), seconds: (performance.now() - start) / 1000 });
    child.on('error', (error) => {
      chunks.push(Buffer.from(`${error.message}\n`));
      klaar(1);
    });
    child.on('close', (code) => klaar(code ?? 1));
  });
}

/**
 * Draait de banen tegelijk, elke baan na elkaar, en drukt de uitslagen af in de volgorde van `scripts`. Met een object
 * draait het een deel en noemt de slotregel dat deel.
 * @param {readonly string[] | { scripts: readonly string[], naam: string }} keuze
 * @param {(script: string) => Promise<Uitslag>} run
 * @param {(text: string) => void} write
 */
export async function gateFast(keuze, run = draai, write = (text) => process.stdout.write(text)) {
  const { scripts, naam } = 'naam' in keuze ? keuze : { scripts: keuze, naam: 'gate:fast' };
  /** @type {Map<string, Promise<Uitslag>>} */
  const lopend = new Map();
  for (const baan of banen(scripts)) {
    let vorige = Promise.resolve();
    for (const script of baan) {
      const uitslag = vorige.then(() => run(script));
      lopend.set(script, uitslag);
      vorige = uitslag.then(() => undefined);
    }
  }
  /** @type {Uitslag[]} */
  const uitslagen = [];
  for (const script of scripts) {
    const uitslag = await lopend.get(script);
    if (uitslag !== undefined) uitslagen.push(uitslag);
  }
  const rood = uitslagen.filter((uitslag) => uitslag.code !== 0);
  // Eerst de uitvoer van de rode gates, dan de lijst en de samenvatting: ook een korte rapportage van de staart toont
  // zo welke gates rood zijn en het einde van de laatste fout.
  for (const { script, output } of rood) write(`── ${script} ──\n${output}${output.endsWith('\n') ? '' : '\n'}`);
  for (const { script, code, seconds } of uitslagen)
    write(`${code === 0 ? '✓' : '✗'} ${script} (${seconds.toFixed(1)} s)\n`);
  write(rood.length === 0 ? `✓ ${naam} groen\n` : `✗ ${naam} rood: ${rood.map(({ script }) => script).join(', ')}\n`);
  return rood.length === 0 ? 0 : 1;
}

/** @param {(script: string) => Promise<Uitslag>} run */
function begrensZwareBanen(run) {
  let vorige = Promise.resolve();
  return (/** @type {string} */ script) => {
    if (!EIGEN_BAAN.has(script)) return run(script);
    const result = vorige.then(() => run(script));
    vorige = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/**
 * `--deel <naam>` uit de argumenten; null zonder deelkeuze.
 * @param {readonly string[]} argv
 * @returns {{ naam: string, deel: Deel | null } | null}
 */
export function deelUitArgs(argv) {
  const plek = argv.indexOf('--deel');
  if (plek === -1) return null;
  const naam = argv[plek + 1] ?? '';
  return { naam, deel: deel(naam) };
}

if (import.meta.main) {
  // Eerst de deelkeuze: een onbekend deel stopt zonder andere uitvoer (ci-in-delen AC-4), ook bij weinig geheugen.
  const keuze = deelUitArgs(process.argv.slice(2));
  if (keuze !== null && keuze.deel === null) {
    console.error(`✗ gate:fast: onbekend deel ${keuze.naam}; kies ${DELEN.join(', ').replace(/, (?=[^,]*$)/, ' of ')}`);
    process.exit(1);
  }
  // Tijdens deze hardening: een ESLint-proces van 1,8 GiB naast de tests op een gedeelde 8-GiB-host vulde ook de swap.
  // Laat ruimte voor de derde baan en andere processen. Deze grens (scripts/kit/geheugen.mjs) verandert uitsluitend de planning.
  const beperkt = weinigGeheugen();
  if (beperkt) console.info('gate:fast: weinig geheugen (scripts/kit/geheugen.mjs); lint en tests draaien na elkaar');
  const args = keuze?.deel?.args ?? {};
  const run = (/** @type {string} */ script) => draai(script, args[script] ?? []);
  const scripts = keuze?.deel?.scripts ?? snelleGates();
  process.exitCode = await gateFast(
    keuze === null ? scripts : { scripts, naam: `gate:fast (${keuze.naam})` },
    beperkt ? begrensZwareBanen(run) : run,
  );
}

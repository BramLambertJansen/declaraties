// gate:fast (framework §4, ADR 0045): draait de snelle gates uit het register (scripts/kit/gates.mjs) in drie banen:
// test:unit en lint (de twee langste) elk apart, de rest na elkaar in de derde. Bij weinig beschikbaar geheugen delen de
// zware gates een wachtrij; geen check wordt overgeslagen of anders aangeroepen. Gemeten op 16 cores (2026-10-22): 92 s na
// elkaar, 71 s alles tegelijk (CPU-druk), 61 s in drie banen. Elke gate is een eigen `pnpm <script>` met dezelfde
// exitcode als los; de uitvoer wordt gebufferd: eerst die van de rode gates, dan de lijst, beide in registervolgorde. Anders dan de oude &&-keten
// stopt een rode gate de andere niet, zodat één ronde alle fouten laat zien.
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { gates } from './gates.mjs';

/** @typedef {{ script: string, code: number, output: string, seconds: number }} Uitslag */

/** Gates met een eigen baan; de rest deelt de laatste baan. */
const EIGEN_BAAN = new Set(['test:unit', 'lint']);

/** De snelle gates, in de volgorde van het register. */
export function snelleGates() {
  return gates.filter((gate) => gate.snel).map((gate) => gate.script);
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
 * @returns {Promise<Uitslag>}
 */
function draai(script) {
  const start = performance.now();
  return new Promise((resolve) => {
    const child = spawn('pnpm', [script], { stdio: ['ignore', 'pipe', 'pipe'] });
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
 * Draait de banen tegelijk, elke baan na elkaar, en drukt de uitslagen af in de volgorde van `scripts`.
 * @param {readonly string[]} scripts
 * @param {(script: string) => Promise<Uitslag>} run
 * @param {(text: string) => void} write
 */
export async function gateFast(scripts, run = draai, write = (text) => process.stdout.write(text)) {
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
  // Eerst de uitvoer van de rode gates, dan de lijst en de samenvatting: wie alleen de staart leest (de developer-
  // SubagentStop toont de laatste 40 regels), ziet zo altijd welke gates rood zijn en het einde van de laatste fout.
  for (const { script, output } of rood) write(`── ${script} ──\n${output}${output.endsWith('\n') ? '' : '\n'}`);
  for (const { script, code, seconds } of uitslagen)
    write(`${code === 0 ? '✓' : '✗'} ${script} (${seconds.toFixed(1)} s)\n`);
  write(
    rood.length === 0 ? '✓ gate:fast groen\n' : `✗ gate:fast rood: ${rood.map(({ script }) => script).join(', ')}\n`,
  );
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

/** Dezelfde geheugengrens voor lokale gates en browserworkers. @param {number} [beschikbaar] */
export function weinigGeheugen(beschikbaar = process.availableMemory()) {
  return beschikbaar < 6 * 1024 ** 3;
}

if (import.meta.main) {
  // Tijdens deze hardening: een ESLint-proces van 1,8 GiB naast de tests op een gedeelde 8-GiB-host vulde ook de swap.
  // Laat ruimte voor de derde baan en andere processen. Deze grens verandert uitsluitend de planning.
  const beperkt = weinigGeheugen();
  if (beperkt) console.info('gate:fast: minder dan 6 GiB beschikbaar; lint en tests draaien na elkaar');
  process.exitCode = await gateFast(snelleGates(), beperkt ? begrensZwareBanen(draai) : draai);
}

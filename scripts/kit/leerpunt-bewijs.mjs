// Bewijsjob voor een PR die een leerpunt sluit (ADR 0078 punt 1, spec leerlus-bewijs AC-1 t/m AC-4). Drie stappen, elk een
// eigen workflowstap zodat alleen de eerste een token heeft:
//   voorbereiden <uit.json>                 met GH_TOKEN: gesloten issues (closingIssuesReferences) met labels, en de
//                                           beschrijving uit de event-payload, naar een bestand
//   plan <in.json> <head-map> <basis-sha> <plan.json>   zonder token: sectie ## Leerpunt toetsen tegen diff en treden
//   draai <plan.json> <head-map> <basis-map>            zonder token: elk bewijsbestand op basis (rood op een assertie,
//                                                       bij een typetest: compileert niet) en head (groen)
//   basis <plan.json> <head-map> <basis-map>            worktree van de merge-base als basismap (vóór de install)
// Buiten CI lopen de runs via inKooi (R-TOOL-03); in CI is de wegwerp-runner de grens. Alleen `node:`- en relatieve imports.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inKooi } from './kooi.mjs';
import { bewijsPlan, graphqlData, leesVitest, lijst, metExit, runOordeel, typeUitslag, veld } from './leerpunt.mjs';

const GRAPHQL = `query($owner: String!, $name: String!, $nummer: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $nummer) {
      closingIssuesReferences(first: 50) { nodes { number body labels(first: 30) { nodes { name } } } }
    }
  }
}`;

/** @param {string} naam */
function env(naam) {
  const waarde = process.env[naam];
  if (waarde === undefined || waarde === '') throw new Error(`${naam} ontbreekt`);
  return waarde;
}

/**
 * De gesloten issues met labels, en de body als GitHub die geeft (voor de plek, spec leerlus-herzien AC-3).
 * @param {unknown} data @returns {{ nummer: number, labels: string[], body?: string }[]}
 */
export function leesGesloten(data) {
  const pr = veld(veld(veld(data, 'data'), 'repository'), 'pullRequest');
  return lijst(veld(veld(pr, 'closingIssuesReferences'), 'nodes')).map((node) => {
    const body = veld(node, 'body');
    return {
      nummer: Number(veld(node, 'number')),
      labels: lijst(veld(veld(node, 'labels'), 'nodes')).map((label) => String(veld(label, 'name'))),
      ...(typeof body === 'string' ? { body } : {}),
    };
  });
}

/** @param {string} uit */
async function voorbereiden(uit) {
  const [owner = '', name = ''] = env('REPO').split('/');
  const antwoord = await globalThis.fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('GH_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: GRAPHQL, variables: { owner, name, nummer: Number(env('PR_NUMBER')) } }),
  });
  if (!antwoord.ok) throw new Error(`geen toegang tot issuelabels: HTTP ${String(antwoord.status)}`);
  const event = JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8'));
  const body = String(veld(veld(event, 'pull_request'), 'body') ?? '');
  const data = graphqlData(await antwoord.json(), ['repository', 'pullRequest']);
  writeFileSync(uit, JSON.stringify({ gesloten: leesGesloten({ data }), body }));
}

/** @param {string} map @param {string[]} args */
function git(map, args) {
  const r = spawnSync('git', ['-C', map, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/**
 * Toegevoegde of gewijzigde paden tussen de merge-base en HEAD (`git diff --name-status -z`).
 * @param {string} uitvoer @returns {string[]}
 */
export function diffPaden(uitvoer) {
  const delen = uitvoer.split('\0').filter((deel) => deel !== '');
  /** @type {string[]} */
  const paden = [];
  for (let i = 0; i < delen.length; i++) {
    const status = delen[i] ?? '';
    if (status.startsWith('R') || status.startsWith('C')) {
      paden.push(delen[i + 2] ?? '');
      i += 2;
    } else {
      if (status === 'A' || status === 'M') paden.push(delen[i + 1] ?? '');
      i += 1;
    }
  }
  return paden;
}

/** @param {string[]} args invoer, head-map, basis-sha, uitvoerbestand */
function plan([invoer = '', head = '', basisSha = '', uit = '']) {
  const { gesloten, body } = JSON.parse(readFileSync(invoer, 'utf8'));
  const splitsing = git(head, ['merge-base', basisSha, 'HEAD']).trim();
  const diff = diffPaden(git(head, ['diff', '--name-status', '-z', '--find-renames', splitsing, 'HEAD']));
  const uitslag = bewijsPlan({ gesloten, body, diff });
  writeFileSync(uit, JSON.stringify({ ...uitslag, splitsing }));
  if (uitslag.leerpunten.length === 0) console.log('Deze PR sluit geen leerpunt: niets te bewijzen.');
  for (const fout of uitslag.fouten) console.log(`::error title=leerpunt-bewijs::${fout}`);
  if (uitslag.fouten.length > 0) process.exitCode = 1;
}

/**
 * De opdracht voor één bewijsbestand. Unit: vitest met JSON-verslag naar een bestand. Type: `tsc -p` op een tijdelijke
 * tsconfig met alleen dat bestand, want de vitest-projecten draaien geen typecheck; de uitslag is dan de exitstatus.
 * @param {{ pad: string, soort: string }} run @param {string} verslag
 */
export function opdracht(run, verslag) {
  if (run.soort === 'type') return ['exec', 'tsc', '-p', TYPE_CONFIG];
  return ['exec', 'vitest', 'run', run.pad, '--reporter=json', `--outputFile=${verslag}`];
}

export const TYPE_CONFIG = '.leerpunt-tsconfig.json';
export const VERSLAG = '.leerpunt-vitest.json';

/**
 * De tijdelijke tsconfig voor een typetest: die van de laag (web of node) met alleen het bewijsbestand.
 * @param {string} pad @returns {string}
 */
export function typeConfig(pad) {
  const laag = /^src\/(core\/)?web\//.test(pad) ? './tsconfig.web.json' : './tsconfig.node.json';
  return JSON.stringify({ extends: laag, compilerOptions: { incremental: false }, files: [pad], include: [] });
}

/** @param {string[]} args @param {string} map @returns {{ status: number | null, uitvoer: string }} */
function start(args, map) {
  const r =
    process.env['CI'] === 'true'
      ? spawnSync('pnpm', args, { cwd: map, encoding: 'utf8', env: zonderToken(), maxBuffer: 64 * 1024 * 1024 })
      : inKooi(['pnpm', ...args].join(' '), { werkmap: map, timeout: 600_000 });
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return { status: r.status, uitvoer: `${r.stdout}\n${r.stderr}` };
}

/** @param {{ pad: string, soort: string }} run @param {string} map */
function draaiEen(run, map) {
  // In de werkmap, niet in de tmp van de host: de kooi ziet alleen de werkmap (R-TOOL-03).
  const verslag = path.join(map, VERSLAG);
  rmSync(verslag, { force: true });
  if (run.soort === 'type') writeFileSync(path.join(map, TYPE_CONFIG), typeConfig(run.pad));
  const { status, uitvoer } = start(opdracht(run, VERSLAG), map);
  if (run.soort === 'type') return typeUitslag(status, uitvoer);
  const json = existsSync(verslag) ? JSON.parse(readFileSync(verslag, 'utf8')) : null;
  return metExit(leesVitest(json, run.pad), status);
}

/** De omgeving zonder token of geheim voor de PR-code (AC-3). */
export function zonderToken() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !/TOKEN|SECRET|PASSWORD|^ACTIONS_/i.test(k)));
}

/** @param {string} planBestand @param {string} head @param {string} basis */
function draai(planBestand, head, basis) {
  const { runs } = JSON.parse(readFileSync(planBestand, 'utf8'));
  /** @type {string[]} */
  const fouten = [];
  for (const run of lijst(runs)) {
    const r = { pad: String(veld(run, 'pad')), soort: String(veld(run, 'soort')) };
    mkdirSync(path.dirname(path.join(basis, r.pad)), { recursive: true });
    copyFileSync(path.join(head, r.pad), path.join(basis, r.pad));
    const fout = runOordeel(r, { basis: draaiEen(r, basis), head: draaiEen(r, head) });
    console.log(
      fout === null ? `✓ ${r.pad}: rood op de basis, groen op de head` : `::error title=leerpunt-bewijs::${fout}`,
    );
    if (fout !== null) fouten.push(fout);
  }
  if (fouten.length > 0) process.exitCode = 1;
}

/** Een worktree van de merge-base als basismap; alleen als er iets te draaien valt. @param {string} planBestand @param {string} head @param {string} basis */
function maakBasis(planBestand, head, basis) {
  const { runs, splitsing } = JSON.parse(readFileSync(planBestand, 'utf8'));
  const nodig = lijst(runs).length > 0;
  if (nodig && !existsSync(basis)) git(head, ['worktree', 'add', '--detach', basis, String(splitsing)]);
  const uit = process.env['GITHUB_OUTPUT'];
  if (uit !== undefined) writeFileSync(uit, `runs=${String(nodig)}\n`, { flag: 'a' });
}

async function main() {
  const [stap = '', ...args] = process.argv.slice(2);
  if (stap === 'voorbereiden') await voorbereiden(args[0] ?? '');
  else if (stap === 'plan') plan(args);
  else if (stap === 'basis') maakBasis(args[0] ?? '', args[1] ?? '', args[2] ?? '');
  else if (stap === 'draai') draai(args[0] ?? '', args[1] ?? '', args[2] ?? '');
  else throw new Error('gebruik: leerpunt-bewijs.mjs voorbereiden|plan|basis|draai …');
}

if (import.meta.main) await main();

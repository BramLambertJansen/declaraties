// De proef in een tijdelijke kopie (docs/specs/app-init-proef.md, docs/specs/een-proefkopie.md, ADR 0073): in de template
// eerst `app:init`, dan (met `genereer`) de generator, en daarna één keer de snelle suite. Zo maakt een test die alleen in
// de template slaagt (leerpunt #334) of gegenereerde code die gate:fast niet haalt de template-CI rood in plaats van de
// eerste app. `check:new-resource` roept `draaiProef` aan met de echte generator; deze module heeft zelf geen CLI meer
// (bouw-PR 2 van ADR 0073 haalde `check:app-init` weg). Geen pnpm, geen netwerk, geen Docker.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { bijSignaal, git, kopie, ruimOp, script, start } from './proef-kopie.mjs';

/**
 * @typedef {object} Opties
 * @property {boolean} [bewaar] de kopie niet opruimen
 * @property {(root: string) => Promise<void>} genereer de generatorstap
 * @property {string} [naam] de naam van de check in de meldingen
 * @property {string} [onderwerp] wat gate:fast haalt, in de slotregel
 * @property {string} [deel] het deel van de suite (ADR 0076), voor de slotregel
 * @property {Readonly<Record<string, readonly string[]>>} [args] extra argumenten per script, zoals `--shard=1/2`
 */

/**
 * @typedef {{ naam: string, onderwerp: string, wat: string, stappen: string, genereer: Opties['genereer'],
 *   args: Readonly<Record<string, readonly string[]>> }} Vorm
 */

/** Het enige prefix van de kopie (spec een-proefkopie AC-8). */
const PREFIX = 'new-resource-';

/** Een app heeft geen `onderhoud` in .claude/gates.json (ADR 0045). */
function isTemplate(/** @type {string} */ bron) {
  const gates = JSON.parse(readFileSync(path.join(bron, '.claude/gates.json'), 'utf8'));
  return typeof gates === 'object' && gates !== null && 'onderhoud' in gates;
}

/**
 * Naam en meldingen; de melding bij een rode gate noemt de stappen die in de kopie draaiden.
 * @param {Opties} opties
 * @param {boolean} template
 * @returns {Vorm}
 */
function vorm(opties, template) {
  return {
    naam: opties.naam ?? 'check:new-resource',
    onderwerp: opties.onderwerp ?? 'time-entries',
    wat: opties.deel === undefined ? 'gate:fast' : `deel ${opties.deel} van gate:fast`,
    stappen: template ? 'app:init en new:resource (zie leerpunt #334)' : 'new:resource',
    genereer: opties.genereer,
    args: opties.args ?? {},
  };
}

/**
 * app:init als CLI (zodat ook main() meedoet, met --owner voor de breedste init), dan de stand van een app na de init-PR.
 * @param {string} doel
 * @param {string} naam
 * @returns {Promise<boolean>}
 */
async function initialiseer(doel, naam) {
  git(doel, ['update-ref', 'refs/remotes/template/main', 'HEAD']);
  const args = ['scripts/kit/app-init.mjs', 'proef-app', 'Proef-app', '--owner', 'proef-eigenaar'];
  if ((await start(doel, 'node', args)) !== 0) {
    console.error(`✗ ${naam}: app:init faalde in de kopie`);
    return false;
  }
  git(doel, ['add', '-A']);
  git(doel, ['commit', '-q', '-m', 'chore: rename to proef-app']);
  git(doel, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return true;
}

/**
 * @param {string} doel
 * @param {Vorm} v
 * @returns {Promise<boolean>}
 */
async function genereerIn(doel, v) {
  try {
    await v.genereer(doel);
    return true;
  } catch (error) {
    console.error(`✗ ${v.naam}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * @param {string} doel
 * @param {readonly string[]} scripts
 * @param {{ v: Vorm, template: boolean }} context
 * @returns {Promise<number>}
 */
async function proefIn(doel, scripts, { v, template }) {
  if (template && !(await initialiseer(doel, v.naam))) return 1;
  if (!(await genereerIn(doel, v))) return 1;
  for (const naam of scripts) {
    try {
      await script(doel, naam, v.args[naam] ?? []);
    } catch (error) {
      if (error instanceof Error) console.error(error.message);
      console.error(`✗ ${v.naam}: ${naam} faalt na ${v.stappen}`);
      return 1;
    }
  }
  console.log(`${v.naam}: ${v.onderwerp} haalt ${v.wat}${template ? ' na app:init' : ''}`);
  return 0;
}

/**
 * Stopt vóór het kopiëren: geen gates.json of geen node_modules.
 * @param {string} bron
 * @param {Opties} opties
 * @returns {{ code: number } | { template: boolean }}
 */
function voorcontrole(bron, opties) {
  const naam = opties.naam ?? 'check:new-resource';
  if (!existsSync(path.join(bron, '.claude/gates.json'))) {
    console.error(`✗ ${naam}: .claude/gates.json ontbreekt`);
    return { code: 1 };
  }
  const template = isTemplate(bron);
  if (!existsSync(path.join(bron, 'node_modules'))) {
    console.error(`✗ ${naam}: node_modules ontbreekt; draai eerst pnpm install`);
    return { code: 1 };
  }
  return { template };
}

/**
 * @param {string} bron
 * @param {readonly string[]} scripts de scripts uit package.json die na init en generator draaien
 * @param {Opties} opties
 * @returns {Promise<number>} exitcode
 */
export async function draaiProef(bron, scripts, opties) {
  const controle = voorcontrole(bron, opties);
  if ('code' in controle) return controle.code;
  const v = vorm(opties, controle.template);
  const bewaar = opties.bewaar === true;
  const signaal = bijSignaal(PREFIX, bewaar);
  /** @type {string | undefined} */
  let doel;
  try {
    doel = kopie(bron, PREFIX);
    signaal.zet(doel);
    return await proefIn(doel, scripts, { v, template: controle.template });
  } finally {
    signaal.ontkoppel();
    if (doel !== undefined && bewaar) console.log(`${v.naam}: kopie bewaard in ${doel}`);
    else if (doel !== undefined) ruimOp(doel, PREFIX);
  }
}

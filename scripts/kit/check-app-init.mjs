// De proef in een tijdelijke kopie (docs/specs/app-init-proef.md, docs/specs/een-proefkopie.md, ADR 0073): in de template
// eerst `app:init`, dan (met `genereer`) de generator, en daarna één keer de snelle suite. Zo maakt een test die alleen in
// de template slaagt (leerpunt #334) of gegenereerde code die gate:fast niet haalt de template-CI rood in plaats van de
// eerste app. `check:new-resource` roept `draaiProef` aan met `genereer`; de CLI hieronder is de oude `check:app-init`,
// die tot bouw-PR 2 van ADR 0073 ongewijzigd blijft draaien. Geen pnpm, geen netwerk, geen Docker.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { snelleGates } from './gate-fast.mjs';
import { bijSignaal, git, kopie, ruimOp, script, start } from './proef-kopie.mjs';

/**
 * @typedef {object} Opties
 * @property {boolean} [bewaar] de kopie niet opruimen
 * @property {(root: string) => Promise<void>} [genereer] de generatorstap; zonder: de oude check:app-init
 * @property {string} [naam] de naam van de check in de meldingen
 * @property {string} [onderwerp] wat gate:fast haalt, in de slotregel
 */

/** @typedef {{ naam: string, prefix: string, onderwerp: string, stappen: string, genereer?: Opties['genereer'] }} Vorm */

/** Een app heeft geen `onderhoud` in .claude/gates.json (ADR 0045). */
function isTemplate(/** @type {string} */ bron) {
  const gates = JSON.parse(readFileSync(path.join(bron, '.claude/gates.json'), 'utf8'));
  return typeof gates === 'object' && gates !== null && 'onderhoud' in gates;
}

/**
 * Naam, prefix en meldingen. Zonder generator: de oude check:app-init (stappen "app:init", eigen prefix). Met generator:
 * één kopie met het prefix van check:new-resource; de melding noemt de stappen die in de kopie draaiden.
 * @param {Opties} opties
 * @param {boolean} template
 * @returns {Vorm}
 */
function vorm(opties, template) {
  const { genereer } = opties;
  if (genereer === undefined) {
    return {
      naam: 'check:app-init',
      prefix: 'app-init-proef-',
      onderwerp: 'proef-app',
      stappen: 'app:init (de template slaagt; zie leerpunt #334)',
    };
  }
  return {
    naam: opties.naam ?? 'check:new-resource',
    prefix: 'new-resource-',
    onderwerp: opties.onderwerp ?? 'time-entries',
    stappen: template ? 'app:init en new:resource (zie leerpunt #334)' : 'new:resource',
    genereer,
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
  if (v.genereer === undefined) return true;
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
      await script(doel, naam);
    } catch (error) {
      if (error instanceof Error) console.error(error.message);
      console.error(`✗ ${v.naam}: ${naam} faalt na ${v.stappen}`);
      return 1;
    }
  }
  console.log(`${v.naam}: ${v.onderwerp} haalt gate:fast${template ? ' na app:init' : ''}`);
  return 0;
}

/**
 * Stopt vóór het kopiëren: geen gates.json, of (zonder generator) al een app, of geen node_modules.
 * @param {string} bron
 * @param {Opties} opties
 * @returns {{ code: number } | { template: boolean }}
 */
function voorcontrole(bron, opties) {
  const naam = opties.genereer === undefined ? 'check:app-init' : (opties.naam ?? 'check:new-resource');
  if (!existsSync(path.join(bron, '.claude/gates.json'))) {
    console.error(`✗ ${naam}: .claude/gates.json ontbreekt`);
    return { code: 1 };
  }
  const template = isTemplate(bron);
  if (!template && opties.genereer === undefined) {
    console.log('check:app-init: overgeslagen, dit is al een app');
    return { code: 0 };
  }
  if (!existsSync(path.join(bron, 'node_modules'))) {
    console.error(`✗ ${naam}: node_modules ontbreekt; draai eerst pnpm install`);
    return { code: 1 };
  }
  return { template };
}

/**
 * @param {string} bron
 * @param {readonly string[]} scripts de scripts uit package.json die na init en generator draaien
 * @param {Opties} [opties]
 * @returns {Promise<number>} exitcode
 */
export async function draaiProef(bron, scripts, opties = {}) {
  const controle = voorcontrole(bron, opties);
  if ('code' in controle) return controle.code;
  const v = vorm(opties, controle.template);
  const bewaar = opties.bewaar === true;
  const signaal = bijSignaal(v.prefix, bewaar);
  /** @type {string | undefined} */
  let doel;
  try {
    doel = kopie(bron, v.prefix);
    signaal.zet(doel);
    return await proefIn(doel, scripts, { v, template: controle.template });
  } finally {
    signaal.ontkoppel();
    if (doel !== undefined && bewaar) console.log(`${v.naam}: kopie bewaard in ${doel}`);
    else if (doel !== undefined) ruimOp(doel, v.prefix);
  }
}

if (import.meta.main) {
  process.exitCode = await draaiProef(process.cwd(), snelleGates(), { bewaar: process.argv.includes('--bewaar') });
}

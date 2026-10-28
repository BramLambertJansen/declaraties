// check:app-init (docs/specs/app-init-proef.md, leerpunt #334): draait `app:init` op een tijdelijke kopie van de repo en
// daarna de snelle suite in die kopie, zodat een test die alleen in de template slaagt de template-CI rood maakt in plaats
// van de eerste app. Duurt minuten: eigen job in CI, niet in gate:fast. Geen pnpm, geen netwerk, geen Docker.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { snelleGates } from './gate-fast.mjs';
import { bijSignaal, git, kopie, ruimOp, script, start } from './proef-kopie.mjs';

const PREFIX = 'app-init-proef-';

/** Een app heeft geen `onderhoud` in .claude/gates.json (ADR 0045). */
function isTemplate(/** @type {string} */ bron) {
  const gates = JSON.parse(readFileSync(path.join(bron, '.claude/gates.json'), 'utf8'));
  return typeof gates === 'object' && gates !== null && 'onderhoud' in gates;
}

/**
 * app:init als CLI (zodat ook main() meedoet, met --owner voor de breedste init), dan de stand van een app na de init-PR.
 * @param {string} doel
 * @returns {Promise<boolean>}
 */
async function initialiseer(doel) {
  git(doel, ['update-ref', 'refs/remotes/template/main', 'HEAD']);
  const args = ['scripts/kit/app-init.mjs', 'proef-app', 'Proef-app', '--owner', 'proef-eigenaar'];
  if ((await start(doel, 'node', args)) !== 0) {
    console.error('✗ check:app-init: app:init faalde in de kopie');
    return false;
  }
  git(doel, ['add', '-A']);
  git(doel, ['commit', '-q', '-m', 'chore: rename to proef-app']);
  git(doel, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return true;
}

/**
 * @param {string} doel
 * @param {readonly string[]} scripts
 * @returns {Promise<number>}
 */
async function proefIn(doel, scripts) {
  if (!(await initialiseer(doel))) return 1;
  for (const naam of scripts) {
    try {
      await script(doel, naam);
    } catch (error) {
      if (error instanceof Error) console.error(error.message);
      console.error(`✗ check:app-init: ${naam} faalt na app:init (de template slaagt; zie leerpunt #334)`);
      return 1;
    }
  }
  console.log('check:app-init: proef-app haalt gate:fast na app:init');
  return 0;
}

/**
 * @param {string} bron
 * @param {readonly string[]} scripts de scripts uit package.json die na de init draaien
 * @param {{ bewaar?: boolean }} [opties]
 * @returns {Promise<number>} exitcode
 */
export async function draaiProef(bron, scripts, opties = {}) {
  if (!existsSync(path.join(bron, '.claude/gates.json'))) {
    console.error('✗ check:app-init: .claude/gates.json ontbreekt');
    return 1;
  }
  if (!isTemplate(bron)) {
    console.log('check:app-init: overgeslagen, dit is al een app');
    return 0;
  }
  if (!existsSync(path.join(bron, 'node_modules'))) {
    console.error('✗ check:app-init: node_modules ontbreekt; draai eerst pnpm install');
    return 1;
  }
  const bewaar = opties.bewaar === true;
  const signaal = bijSignaal(PREFIX, bewaar);
  /** @type {string | undefined} */
  let doel;
  try {
    doel = kopie(bron, PREFIX);
    signaal.zet(doel);
    return await proefIn(doel, scripts);
  } finally {
    signaal.ontkoppel();
    if (doel !== undefined && bewaar) console.log(`check:app-init: kopie bewaard in ${doel}`);
    else if (doel !== undefined) ruimOp(doel, PREFIX);
  }
}

if (import.meta.main) {
  process.exitCode = await draaiProef(process.cwd(), snelleGates(), { bewaar: process.argv.includes('--bewaar') });
}

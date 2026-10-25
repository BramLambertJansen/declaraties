// check-core (ADR 0040 "Afdwingen", .claude/rules/core.md): een PR in een app wijzigt `src/core/` niet; core-updates komen
// alleen via `git merge template/main`. Draait in guard.yml met de scripts van main. Per commit in de PR (head zonder wat al op main of template/main staat):
// een gewone commit laat `src/core` gelijk aan zijn ouder; een merge die `src/core` verandert, telt alleen als zijn tweede
// ouder P2 een voorouder is van `template/main` (opgehaald van TEMPLATE_URL) of al op main staat (een `git merge origin/main`
// in de branch), en `src/core` in de merge gelijk is aan dat in P2 (geen eigen wijziging in de merge zelf).
// Een commit zonder ouder (orphan) faalt altijd.
// In de template zelf staat de check uit: daar staat `onderhoud.repository` in de vertrouwde `.claude/gates.json` (ADR 0045;
// `pnpm app:init` haalt die regel in een app weg). Onleesbare geschiedenis of template telt als fout.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CORE = 'src/core';
export const TEMPLATE_URL = 'https://github.com/BramLambertJansen/template.git';
const TEMPLATE_REF = 'refs/guard/template';

/**
 * @param {string} root
 * @param {readonly string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * De tree-hash van src/core in een commit ('' als de map ontbreekt).
 * @param {string} root
 * @param {string} commit
 */
function coreTree(root, commit) {
  try {
    return git(root, ['rev-parse', `${commit}:${CORE}`]);
  } catch {
    return '';
  }
}

/**
 * @param {string} root
 * @param {string} voorouder
 * @param {string} commit
 */
function isVoorouder(root, voorouder, commit) {
  try {
    git(root, ['merge-base', '--is-ancestor', voorouder, commit]);
    return true;
  } catch {
    return false;
  }
}

/** De al geïmporteerde templategeschiedenis per ouder, ook bij meerdere merge-bases. @param {string} root @param {string} parent @param {string} template */
function templateBases(root, parent, template) {
  try {
    return git(root, ['merge-base', '--all', parent, template]).split('\n').filter(Boolean);
  } catch (error) {
    // Geen gedeelde geschiedenis kan voorkomen bij de eenmalige app-koppeling. Andere leesfouten falen dicht.
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) return [];
    throw error;
  }
}

/** @param {string} root @param {string} base */
function coreBron(root, base) {
  const bron = git(root, ['rev-list', '--topo-order', '-1', base, '--', CORE]) || base;
  if (coreTree(root, bron) !== coreTree(root, base))
    throw new Error('Geen eenduidige coreversie in templategeschiedenis');
  return bron;
}

/** Een gekozen core moet alle reeds geïmporteerde templateversies omvatten; geen nieuw versieregister. @param {string} root @param {{ parents: string[], template: string, core: string }} merge */
function oudereCore(root, merge) {
  // Docs-only zijtakken dragen geen nieuwe coreversie. Vergelijk de laatste echte corewijziging, niet hun tip.
  const gedeeld = merge.parents.flatMap((parent) => templateBases(root, parent, merge.template));
  const bases = [...new Set(gedeeld.map((base) => coreBron(root, base)))];
  const bronnen = bases.filter((base) => coreTree(root, base) === merge.core);
  return bases.length > 0 && !bronnen.some((bron) => bases.every((base) => isVoorouder(root, base, bron)));
}

/**
 * Staat de onderhoudsmodus voor deze repository in de (vertrouwde) gates.json, dan is dit de template zelf.
 * @param {string} gatesJson
 * @param {string} repository
 */
export function isTemplateRepo(gatesJson, repository) {
  /** @type {unknown} */
  const ruw = JSON.parse(gatesJson);
  const onderhoud = typeof ruw === 'object' && ruw !== null && 'onderhoud' in ruw ? ruw.onderhoud : undefined;
  const repo =
    typeof onderhoud === 'object' && onderhoud !== null && 'repository' in onderhoud ? onderhoud.repository : undefined;
  return typeof repo === 'string' && repo.toLowerCase() === repository.toLowerCase();
}

/**
 * Oordeel over één commit: undefined als hij mag, anders de reden.
 * @param {string} root
 * @param {{ base: string, template: string }} refs
 * @param {string} commit
 * @returns {string | undefined}
 */
function commitFout(root, refs, commit) {
  const ouders = git(root, ['rev-list', '--parents', '-n', '1', commit]).split(' ').slice(1);
  const eigen = coreTree(root, commit);
  const [eerste, tweede] = ouders;
  const kort = commit.slice(0, 12);
  // Een root-commit (orphan) in de PR heeft geen ouder om mee te vergelijken; die hoort nooit in een app-PR.
  if (eerste === undefined) return `${kort} is een commit zonder ouder (orphan); die kan ${CORE}/ ongezien vervangen`;
  const verschilt = ouders.some((parent) => coreTree(root, parent) !== eigen);
  if (ouders.length > 2 && verschilt) return `${kort} wijzigt ${CORE}/ buiten een template-merge (octopus)`;
  if (eigen !== coreTree(root, eerste)) {
    if (tweede === undefined || ouders.length > 2) return `${kort} wijzigt ${CORE}/ buiten een template-merge`;
    const vertrouwd = isVoorouder(root, tweede, refs.template) || isVoorouder(root, tweede, refs.base);
    if (!vertrouwd)
      return `${kort}: merge van ${tweede.slice(0, 12)}, dat niet in template/main of main staat, wijzigt ${CORE}/`;
    if (eigen !== coreTree(root, tweede))
      return `${kort}: de merge wijzigt ${CORE}/ zelf (verschilt van ${tweede.slice(0, 12)})`;
  }
  if (tweede !== undefined && verschilt && oudereCore(root, { parents: ouders, template: refs.template, core: eigen }))
    return `${kort}: de merge kiest een oudere core dan een reeds geïmporteerde templateversie`;
  return undefined;
}

/**
 * @param {string} root
 * @param {{ base: string, head: string, template: string }} refs base en head van de PR, template = template/main
 * @returns {string[]}
 */
export function coreFouten(root, refs) {
  try {
    for (const ref of [refs.base, refs.head, refs.template]) git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  } catch {
    return [`base, head of template/main (${refs.template}) is niet te lezen; haal de geschiedenis volledig op`];
  }
  // Alleen wat de app toevoegt: niet wat al op main staat (ook bij meerdere merge-bases) en niet de commits van de
  // template zelf, die met een template-merge meekomen.
  const commits = git(root, ['rev-list', '--reverse', refs.head, `^${refs.base}`, `^${refs.template}`])
    .split('\n')
    .filter(Boolean);
  return commits.map((commit) => commitFout(root, refs, commit)).filter((fout) => fout !== undefined);
}

/** @param {string} naam */
function env(naam) {
  const waarde = process.env[naam];
  if (waarde === undefined || waarde === '') throw new Error(`${naam} ontbreekt`);
  return waarde;
}

/** @param {string} tekst */
function meld(tekst) {
  console.log(tekst);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined) appendFileSync(summary, `${tekst}\n`);
}

function main() {
  const gates = readFileSync(path.join(import.meta.dirname, '../../.claude/gates.json'), 'utf8');
  if (isTemplateRepo(gates, env('REPO'))) {
    meld('check-core: uit in de template zelf (onderhoud.repository, ADR 0040)');
    return;
  }
  try {
    git('.', ['fetch', '--no-tags', '--quiet', TEMPLATE_URL, `+refs/heads/main:${TEMPLATE_REF}`]);
  } catch {
    // Faalt dicht: zonder template/main is geen merge te beoordelen. De template moet zonder credentials op te halen zijn.
    meld(
      `✗ check-core: ${TEMPLATE_URL} is niet op te halen (privé of onbereikbaar); zonder template/main faalt de check`,
    );
    console.log(`::error title=check-core::${TEMPLATE_URL} is niet op te halen`);
    process.exitCode = 1;
    return;
  }
  // De workflow haalt de PR en main op als refs/guard/{head,base} en controleert ze (zoals voor de diff-guard).
  const fouten = coreFouten('.', { base: 'refs/guard/base', head: 'refs/guard/head', template: TEMPLATE_REF });
  if (fouten.length === 0) {
    meld(`✓ check-core: ${CORE}/ alleen gewijzigd via template-merges`);
    return;
  }
  meld(`✗ check-core: een app wijzigt ${CORE}/ niet (ADR 0040)\n${fouten.map((fout) => `  - ${fout}`).join('\n')}`);
  console.log(`::error title=check-core::${fouten.join('; ')}`);
  process.exitCode = 1;
}

if (import.meta.main) main();

// Leerpunt #432: wat de guard of een hook draait, laadt alleen Node-builtins en bestanden die er op runtime staan.
// De guard-jobs in .github/workflows/guard.yml draaien zonder install op een checkout van de hele commit (ADR 0045
// punt 15–19): daar mag alles in de repo, maar geen npm-pakket. De lader (.claude/hooks/laden.mjs) pakt alleen de
// tree `rails/hooks` van main uit en start de hook daar (R-ROL-09): een hook mag dus niet buiten `rails/hooks/`
// importeren, en een stub in `.claude/hooks` niet buiten `.claude/hooks/`. Lint, typecheck en unit-tests zien geen
// van beide, want lokaal staan node_modules en de hele repo er. Deze module loopt de importgraaf af met
// dependency-cruiser (een parser, R-CODE-01) vanaf alle ingangen. Hij draait zelf alleen in de tests
// (test/rails/guard-imports.test.ts) en hoort niet bij die graaf.
// Bekende gaten: een dynamische import met een berekende naam (`import(naam)`) en
// `process.getBuiltinModule('module')` zijn statisch niet als import te zien.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cruise } from 'dependency-cruiser';

const workflow = '.github/workflows/guard.yml';
const hookDirs = ['.claude/hooks', 'rails/hooks'];
// `node <script>` in een run-stap, ook in een blok met meerdere regels of na `;`, `&&`, `|`.
const nodeRun = /(?:^|[\s;&|])node\s+([\w./-]+\.(?:mjs|cjs|js))\b/g;
// Elke andere vorm (`node --optie script.mjs`, `node -e`) zou stil geen ingang worden: dan faalt de check dicht.
const otherNodeRun = /(?:^|[\s;&|])node\s+-/;
// node:module geeft createRequire en register: daarmee laadt code een pakket buiten de importgraaf om.
const forbiddenBuiltins = new Set(['module']);

/** @typedef {{ from: string, to: string, reason: 'npm-pakket' | 'node:module' | 'buiten-hookmap' }} Violation */

/**
 * Ingangen relatief aan baseDir, gesorteerd: elk script dat guard.yml met `node` start, plus elke `.mjs` direct in
 * een hookmap (de lader start `rails/hooks/<naam>.mjs`, de stubs staan in `.claude/hooks`).
 * @param {string} baseDir
 */
export function guardEntries(baseDir) {
  /** @type {Set<string>} */
  const entries = new Set();
  const yml = path.join(baseDir, workflow);
  if (existsSync(yml)) {
    const text = readFileSync(yml, 'utf8');
    const other = text.split('\n').find((line) => otherNodeRun.test(line));
    if (other !== undefined)
      throw new Error(`${workflow}: onbekende node-aanroep, breid guard-imports.mjs uit: ${other.trim()}`);
    for (const match of text.matchAll(nodeRun)) entries.add(path.posix.normalize(match[1] ?? ''));
  }
  for (const dir of hookDirs) {
    const full = path.join(baseDir, dir);
    if (!existsSync(full)) continue;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.mjs')) entries.add(`${dir}/${entry.name}`);
    }
  }
  return [...entries].sort();
}

/**
 * Elke import in de graaf vanaf guardEntries die op runtime niet laadt, gesorteerd.
 * @param {string} baseDir
 * @returns {Promise<Violation[]>}
 */
export async function guardImportViolations(baseDir) {
  const entries = guardEntries(baseDir);
  if (entries.length === 0) throw new Error(`geen ingangen gevonden onder ${baseDir}`);
  const { output } = await cruise(entries, { baseDir, doNotFollow: { path: 'node_modules' } });
  if (typeof output === 'string') throw new Error('dependency-cruiser gaf geen resultaatobject');
  const modules = new Map(output.modules.map((module) => [module.source, module]));
  /** @type {Map<string, Violation>} */
  const violations = new Map();
  /** @param {Violation} violation */
  const add = (violation) => violations.set(`${violation.from} ${violation.to} ${violation.reason}`, violation);
  for (const module of modules.values()) {
    if (module.coreModule === true || inNodeModules(module.source)) continue;
    for (const dependency of module.dependencies) {
      const reason = loadReason(dependency);
      if (reason !== null) add({ from: module.source, to: dependency.module, reason });
    }
  }
  for (const entry of entries) {
    const zone = hookDirs.find((dir) => entry.startsWith(`${dir}/`));
    if (zone !== undefined) outsideZone(modules, entry, `${zone}/`).forEach(add);
  }
  return [...violations.values()].sort((a, b) => `${a.from} ${a.to}`.localeCompare(`${b.from} ${b.to}`));
}

/** @param {{ coreModule: boolean, module: string, couldNotResolve: boolean, resolved: string, dependencyTypes: string[] }} dependency */
function loadReason(dependency) {
  if (dependency.coreModule)
    return forbiddenBuiltins.has(dependency.module.replace(/^node:/, '')) ? 'node:module' : null;
  return ownFile(dependency) ? null : 'npm-pakket';
}

/**
 * Lokale imports die vanaf een hookingang buiten zijn map uitkomen; de graaf erachter telt al bij de npm-controle.
 * @param {Map<string, { dependencies: { couldNotResolve: boolean, resolved: string, module: string, dependencyTypes: string[] }[] }>} modules
 * @param {string} entry
 * @param {string} zone
 * @returns {Violation[]}
 */
function outsideZone(modules, entry, zone) {
  /** @type {Violation[]} */
  const found = [];
  const seen = new Set([entry]);
  const queue = [entry];
  for (let source = queue.shift(); source !== undefined; source = queue.shift()) {
    for (const dependency of modules.get(source)?.dependencies ?? []) {
      if (!ownFile(dependency)) continue;
      if (!dependency.resolved.startsWith(zone))
        found.push({ from: source, to: dependency.module, reason: 'buiten-hookmap' });
      else if (!seen.has(dependency.resolved)) {
        seen.add(dependency.resolved);
        queue.push(dependency.resolved);
      }
    }
  }
  return found;
}

/** @param {string} file */
function inNodeModules(file) {
  return file.split('/').includes('node_modules');
}

/** Een opgelost bestand in de repo, buiten node_modules; een kaal pakket of iets onoplosbaars is dat nooit.
 * @param {{ couldNotResolve: boolean, resolved: string, dependencyTypes: string[] }} dependency */
function ownFile(dependency) {
  if (dependency.couldNotResolve || inNodeModules(dependency.resolved)) return false;
  return (
    dependency.dependencyTypes.includes('local') &&
    !path.isAbsolute(dependency.resolved) &&
    !dependency.resolved.startsWith('..')
  );
}

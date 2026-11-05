// Preflight van de toolchain (docs/ENVIRONMENT.md): vóór een script modules met dependencies laadt, één leesbare regel in
// plaats van een stacktrace als Node niet de versie uit mise.toml is of node_modules ontbreekt of onvolledig is (verse cloudsessie zonder setup, onderbroken install).
// Zonder dependencies, zodat het ook op een kale Node draait.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * Zelfde major en minstens de versie uit mise.toml; dat valt binnen `engines` in package.json (`>=26.11 <27`).
 * @param {string} node
 * @param {string} verwacht
 */
function passend(node, verwacht) {
  const delen = (/** @type {string} */ versie) => versie.replace(/^v/, '').split('.').map(Number);
  const [major = 0, ...rest] = delen(node);
  const [wantMajor = 0, ...wantRest] = delen(verwacht);
  if (major !== wantMajor) return false;
  for (const [i, want] of wantRest.entries()) {
    const have = rest[i] ?? 0;
    if (have !== want) return have > want;
  }
  return true;
}

/**
 * @param {{ node: string, miseToml: string, nodeModules: boolean }} feiten
 * @returns {string | null}
 */
export function toolchainProbleem({ node, miseToml, nodeModules }) {
  const verwacht = /^node\s*=\s*"([^"]+)"/m.exec(miseToml)?.[1];
  const problemen = [];
  if (verwacht !== undefined && !passend(node, verwacht))
    problemen.push(`Node ${node}, verwacht ${verwacht} of nieuwer binnen dezelfde major (mise.toml)`);
  if (!nodeModules) problemen.push('node_modules ontbreekt of is onvolledig');
  if (problemen.length === 0) return null;
  return setupProbleem(problemen.join('; '));
}

/** @param {string} reden */
function setupProbleem(reden) {
  return `✗ toolchain ontbreekt: ${reden} → draai \`bash scripts/cloud-setup.sh\` (cloud) of \`scripts/bootstrap.sh\` (lokaal), zie docs/ENVIRONMENT.md`;
}

/** @param {string} root */
function pnpmPin(root) {
  try {
    /** @type {unknown} */
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (typeof pkg !== 'object' || pkg === null || !('packageManager' in pkg) || typeof pkg.packageManager !== 'string')
      return null;
    return /^pnpm@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(pkg.packageManager)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** @param {string} root */
function pnpmProbleem(root) {
  const verwacht = pnpmPin(root);
  if (verwacht === null) return setupProbleem('packageManager moet een exacte pnpm@x.y.z-versie bevatten');
  const result = spawnSync('pnpm', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 4096,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined || result.status !== 0)
    return setupProbleem(`pnpm ontbreekt of start niet, verwacht ${verwacht}`);
  const werkelijk = result.stdout.trim().replace(/\s+/g, ' ').slice(0, 120) || 'onbekend';
  return werkelijk === verwacht
    ? null
    : setupProbleem(`pnpm ${werkelijk}, verwacht exact ${verwacht} (packageManager)`);
}

// Snelle aanwezigheidscontrole: deze bestanden bewijzen geen synchronisatie met lockfile of workspace.
// Voor run/exec controleert pnpm dat zelf met verifyDepsBeforeRun: error (pnpm-workspace.yaml).
const INSTALLATIE = ['.modules.yaml', 'typescript/package.json'];

/** @param {string} root */
export function toolchainProbleemIn(root) {
  const mise = path.join(root, 'mise.toml');
  const probleem = toolchainProbleem({
    node: process.version,
    miseToml: existsSync(mise) ? readFileSync(mise, 'utf8') : '',
    nodeModules: INSTALLATIE.every((rel) => existsSync(path.join(root, 'node_modules', rel))),
  });
  return probleem ?? pnpmProbleem(root);
}

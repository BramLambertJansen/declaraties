// Preflight van de toolchain (docs/ENVIRONMENT.md): vóór een script modules met dependencies laadt, één leesbare regel in
// plaats van een stacktrace als Node niet de versie uit mise.toml is of node_modules ontbreekt (verse cloudsessie zonder setup).
// Zonder dependencies, zodat het ook op een kale Node draait.
import { existsSync, readFileSync } from 'node:fs';
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
  if (!nodeModules) problemen.push('node_modules ontbreekt');
  if (problemen.length === 0) return null;
  return `✗ toolchain ontbreekt: ${problemen.join('; ')} → draai \`bash scripts/cloud-setup.sh\` (cloud) of \`scripts/bootstrap.sh\` (lokaal), zie docs/ENVIRONMENT.md`;
}

/** @param {string} root */
export function toolchainProbleemIn(root) {
  const mise = path.join(root, 'mise.toml');
  return toolchainProbleem({
    node: process.version,
    miseToml: existsSync(mise) ? readFileSync(mise, 'utf8') : '',
    nodeModules: existsSync(path.join(root, 'node_modules')),
  });
}

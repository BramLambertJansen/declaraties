// Entry voor de statusregel van Claude Code (`statusLine`, framework §8): de opmaak staat in lib/statusregel.mjs (getest in
// test/hooks/statusregel.test.ts). Nooit netwerk: de achterstand komt uit de laatst opgehaalde origin/main, de stack uit een
// TCP-check op 127.0.0.1. Schrijft één regel en eindigt altijd met exit 0.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { poorten, statusregel } from './lib/statusregel.mjs';

const TIMEOUT_MS = 300;

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim();
  } catch {
    return null;
  }
}

/** @param {number} poort @returns {Promise<boolean>} */
function luistert(poort) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: poort });
    const klaar = (/** @type {boolean} */ open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(TIMEOUT_MS, () => klaar(false));
    socket.once('connect', () => klaar(true));
    socket.once('error', () => klaar(false));
  });
}

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
function veld(waarde, sleutel) {
  return typeof waarde === 'object' && waarde !== null ? Object.entries(waarde).find(([naam]) => naam === sleutel)?.[1] : undefined;
}

function leesPayload() {
  try {
    /** @type {unknown} */
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    return payload;
  } catch {
    return {};
  }
}

/** @param {string} root */
function leesEnvLocal(root) {
  try {
    return readFileSync(path.join(root, '.env.local'), 'utf8');
  } catch {
    return null;
  }
}

async function main() {
  const payload = leesPayload();
  const cwdVeld = veld(payload, 'cwd');
  const cwd = typeof cwdVeld === 'string' ? cwdVeld : process.cwd();
  const root = git(cwd, ['rev-parse', '--show-toplevel']) ?? cwd;
  const achter = Number(git(root, ['rev-list', '--count', 'HEAD..origin/main']) ?? Number.NaN);
  const status = git(root, ['status', '--porcelain', '--untracked-files=all']) ?? '';
  const stack = poorten(leesEnvLocal(root));
  const open = await Promise.all(stack.map(({ poort }) => luistert(poort)));
  const model = veld(veld(payload, 'model'), 'display_name');
  const regel = statusregel({
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? '?',
    achter: Number.isFinite(achter) ? achter : null,
    gewijzigd: status === '' ? 0 : status.split('\n').length,
    uit: stack.filter((_, index) => open[index] !== true).map(({ naam }) => naam),
    ...(typeof model === 'string' && model !== '' ? { model } : {}),
  });
  process.stdout.write(`${regel}\n`);
}

try {
  await main();
} catch {
  // Fail-open: een statusregel die niet lukt, hindert niets.
}
process.exitCode = 0;

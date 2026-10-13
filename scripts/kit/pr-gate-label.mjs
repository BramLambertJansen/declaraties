// Het label is uitsluitend administratie; diff-guard blijft de echte eigenaarreview controleren (ADR 0027).
import { execFileSync } from 'node:child_process';
import { readAuthority, gitText } from '../../.claude/hooks/lib/authority-context.mjs';
import { pullRequest } from './github-evidence.mjs';
import { parseNameStatus, leesConfig, geraakt } from './diff-guard.mjs';

/** @param {{ status: string, pad: string, van?: string }[]} changes @param {string} policy */
export function labelScope(changes, policy) {
  if (changes.length === 0 || !['docs', 'all'].includes(policy)) return false;
  const files = changes.flatMap(({ pad, van }) => [pad, ...(van === undefined ? [] : [van])]);
  return (
    policy === 'all' ||
    files.every((file) => /^(?:docs\/.+\.md|AGENTS\.md|CLAUDE\.md|README\.md|CHANGELOG\.md)$/.test(file))
  );
}

/** @param {string} text */
function policyFrom(text) {
  /** @type {unknown} */
  const value = JSON.parse(text);
  return typeof value === 'object' && value !== null && 'gateMarker' in value && typeof value.gateMarker === 'string'
    ? value.gateMarker
    : '';
}

async function main() {
  const [number, ...rest] = process.argv.slice(2);
  if (!/^[1-9]\d*$/.test(number ?? '') || rest.length !== 0) throw new Error('Gebruik: pnpm pr:label-gate <nummer>');
  const root = process.cwd();
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim();
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  if (authority === null || head === undefined || base === undefined) throw new Error('Geen leesbare vertrouwde basis');
  const configText = gitText(root, ['show', `${base}:.claude/gates.json`]) ?? '';
  const changes = parseNameStatus(
    gitText(root, ['diff', '--name-status', '-z', '--find-renames', `${base}...${head}`]) ?? '',
  );
  if (!labelScope(changes, policyFrom(configText)))
    throw new Error('PR valt buiten het eigenaarmandaat voor het label');
  const config = leesConfig(configText);
  const split = gitText(root, ['merge-base', base, head])?.trim();
  if (split === undefined) throw new Error('Geen leesbare merge-base');
  const json = Object.fromEntries(
    Object.keys(config.jsonGates).map((file) => [
      file,
      {
        voor: gitText(root, ['show', `${split}:${file}`]),
        na: gitText(root, ['show', `${head}:${file}`]),
      },
    ]),
  );
  const hit = geraakt({ wijzigingen: changes, json, labels: [], reviews: [], auteur: '', headSha: head }, config);
  if (hit.gates.length + hit.tests.length + hit.json.length === 0) throw new Error('Geen gate-wijziging in deze PR');
  const pr = pullRequest(authority.repository, Number(number));
  if (pr.headSha !== head || pr.branch !== authority.branch || pr.state !== 'open')
    throw new Error('PR komt niet overeen met HEAD');
  execFileSync('gh', ['pr', 'edit', String(number), '--repo', authority.repository, '--add-label', 'gate-wijziging'], {
    stdio: 'inherit',
  });
  console.log('gate-wijziging gezet als markering; eigenaarreview en verplichte checks blijven vereist');
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

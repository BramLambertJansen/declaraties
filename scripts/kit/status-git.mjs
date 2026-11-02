import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { gitText } from '../../rails/hooks/lib/authority-context.mjs';
import { readRegistry } from '../../rails/hooks/lib/task-authority.mjs';

/** @param {string} root @param {{ head: string, branch: string, base: string }} expected */
export function unchangedHead(root, expected) {
  return (
    gitText(root, ['rev-parse', 'HEAD'])?.trim() === expected.head &&
    gitText(root, ['branch', '--show-current'])?.trim() === expected.branch &&
    gitText(root, ['rev-parse', 'origin/main'])?.trim() === expected.base
  );
}
import { parseNameStatus } from './diff-guard.mjs';
import { kaderVan, ROADMAP, taakVinkje } from './roadmap-item.mjs';

/** @param {string} root @param {string} sha @param {string} pad */
function bestandOp(root, sha, pad) {
  return gitText(root, ['show', `${sha}:${pad}`]);
}

/** Alleen de statusregel wijzigt: de rest van het document heeft in beide commits dezelfde digest. */
/** @param {string} root @param {{ from: string, to: string }} commits @param {string} pad */
function alleenStatus(root, commits, pad) {
  const before = documentInfo(pad, bestandOp(root, commits.from, pad) ?? '');
  const after = documentInfo(pad, bestandOp(root, commits.to, pad) ?? '');
  return before !== null && after !== null && before.digest === after.digest;
}

/** Specs die in from..to naar gebouwd gaan (spec taakmandaat-vervolg, AC-7). */
/** @param {string} root @param {{ from: string, to: string }} commits @param {string[]} paden */
function specsNaarGebouwd(root, commits, paden) {
  return paden.filter((pad) => {
    const before = documentInfo(pad, bestandOp(root, commits.from, pad) ?? '');
    const after = documentInfo(pad, bestandOp(root, commits.to, pad) ?? '');
    return before?.kind === 'spec' && before.status !== 'gebouwd' && after?.status === 'gebouwd';
  });
}

/** Het vinkje van het item van een spec die in from..to naar gebouwd gaat, mag meewijzigen (B1). */
/** @param {string} root @param {{ from: string, to: string }} commits @param {{ paden: string[], testpaden: readonly string[] }} wijziging */
function roadmapToegestaan(root, commits, { paden, testpaden }) {
  const bestanden = (gitText(root, ['ls-tree', '-r', '--name-only', '-z', commits.to]) ?? '')
    .split('\0')
    .filter(Boolean);
  const kader = kaderVan({ packageJson: bestandOp(root, commits.to, 'package.json'), bestanden, testpaden });
  const melding = taakVinkje({
    basis: bestandOp(root, commits.from, ROADMAP),
    head: bestandOp(root, commits.to, ROADMAP),
    specs: specsNaarGebouwd(root, commits, paden),
    kader,
  });
  return melding === null;
}

/**
 * Alleen statusregels (en het vinkje van de eigen taak) wijzigen tussen de gevalideerde commit en de huidige.
 * @param {string} root
 * @param {{ from: string, to: string }} commits
 * @param {{ testpaden?: readonly string[] }} [opties]
 */
export function statusOnlyDiff(root, commits, opties = {}) {
  if (![commits.from, commits.to].every((sha) => /^[0-9a-f]{40}$/.test(sha))) return false;
  const diff = gitText(root, [
    'diff',
    '--name-status',
    '-z',
    '--no-ext-diff',
    '--no-textconv',
    commits.from,
    commits.to,
  ]);
  if (diff === null) return false;
  const wijzigingen = parseNameStatus(diff);
  if (wijzigingen.some(({ status }) => status !== 'M')) return false;
  const documenten = wijzigingen.map(({ pad }) => pad).filter((pad) => pad !== ROADMAP);
  if (!documenten.every((pad) => alleenStatus(root, commits, pad))) return false;
  return (
    documenten.length === wijzigingen.length ||
    roadmapToegestaan(root, commits, { paden: documenten, testpaden: opties.testpaden ?? [] })
  );
}

/** @param {string} root @param {{ from: string, to: string }} commits */
export function isAncestor(root, commits) {
  if (![commits.from, commits.to].every((sha) => /^[0-9a-f]{40}$/.test(sha))) return false;
  return gitText(root, ['merge-base', '--is-ancestor', commits.from, commits.to]) !== null;
}

/** @param {string} root @param {string} file @param {string} sha */
export function regularGitFile(root, file, sha) {
  const tree = gitText(root, ['ls-tree', sha, '--', file]);
  return tree !== null && /^100(?:644|755) blob [0-9a-f]{40}\t/.test(tree);
}

/** `requiredChecks` uit het register in een commit, of null als het ontbreekt of ongeldig is. @param {string} root @param {string} sha */
function requiredChecksOp(root, sha) {
  const text = bestandOp(root, sha, '.claude/decisions.json');
  if (text === null) return null;
  try {
    return readRegistry(text).requiredChecks;
  } catch {
    return null;
  }
}

/** Gewijzigde bestanden buiten docs/ en CHANGELOG.md die de spec letterlijk tussen backticks noemt. */
/** @param {string} root @param {{ from: string, to: string }} commits @param {string} spec */
function bouwpadenVan(root, commits, spec) {
  const diff = gitText(root, ['diff', '--name-only', '-z', '--no-renames', commits.from, commits.to]);
  if (diff === null) return [];
  const genoemd = new Set([...spec.matchAll(/`([^`\s]+)`/g)].map(([, pad]) => pad));
  return diff
    .split('\0')
    .filter((pad) => pad !== '' && !pad.startsWith('docs/') && pad !== 'CHANGELOG.md' && genoemd.has(pad))
    .toSorted();
}

/**
 * Bouwbewijs uit Git voor een gemergde PR (spec gebouwd-na-merge): ligt de mergecommit in head, zijn ouders, de spec erin, de
 * verplichte checks uit main vlak vóór de merge en de bouwpaden.
 * @param {string} root @param {{ mergeSha: string, head: string, file: string }} doel
 * @returns {import('../../rails/hooks/lib/built-evidence.mjs').MergedEvidence}
 */
export function mergedEvidence(root, { mergeSha, head, file }) {
  const geldig = /^[0-9a-f]{40}$/.test(mergeSha);
  const regel = geldig ? gitText(root, ['rev-list', '--parents', '-n', '1', mergeSha]) : null;
  const parents = (regel?.trim().split(' ') ?? []).slice(1);
  const specAtMerge = geldig ? bestandOp(root, mergeSha, file) : null;
  const eerste = parents[0];
  return {
    inHead: isAncestor(root, { from: mergeSha, to: head }),
    parents,
    specAtMerge,
    requiredChecks: eerste === undefined ? null : requiredChecksOp(root, eerste),
    bouwpaden:
      eerste === undefined || specAtMerge === null
        ? []
        : bouwpadenVan(root, { from: eerste, to: mergeSha }, specAtMerge),
  };
}

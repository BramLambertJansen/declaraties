import { documentInfo } from '../../.claude/hooks/lib/document-state.mjs';
import { gitText } from '../../.claude/hooks/lib/authority-context.mjs';

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

/** Specs die in from..to naar gebouwd gaan, ongeacht een mandaat (spec taakmandaat-vervolg, AC-7). */
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

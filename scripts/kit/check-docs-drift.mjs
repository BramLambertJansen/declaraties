// check:docs-drift (AGENTS.md "Docs in dezelfde PR", framework §8): wijzigt src/ ten opzichte van het afsplitspunt met
// origin/main zonder dat docs/ of CHANGELOG.md meewijzigt, dan volgt een waarschuwing. Nooit een blokkade (exit 0): niet elke
// wijziging raakt gedrag, API of conventies; de reviewer beoordeelt dat. Onleesbare base is ook alleen een waarschuwing.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BASE = 'origin/main';
const GEGENEREERD = new Set(['src/web/routeTree.gen.ts', 'src/api/db/schema.ts']);
const TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * @param {readonly string[]} paden gewijzigde paden t.o.v. het afsplitspunt
 * @returns {string | null} de waarschuwing, of null als er niets te melden is
 */
export function driftWaarschuwing(paden) {
  const code = paden.filter((pad) => pad.startsWith('src/') && !TEST.test(pad) && !GEGENEREERD.has(pad));
  const docs = paden.some((pad) => pad.startsWith('docs/') || pad === 'CHANGELOG.md');
  if (code.length === 0 || docs) return null;
  return `src/ wijzigt (${code.length} bestand${code.length === 1 ? '' : 'en'}) zonder wijziging in docs/ of CHANGELOG.md; raakt dit gedrag, API of conventies, werk dan de doc in deze PR bij`;
}

/**
 * @param {string} [root]
 * @param {string} [base]
 * @returns {string | null}
 */
export function driftVanRepo(root = '.', base = BASE) {
  try {
    const git = (/** @type {string[]} */ args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const afsplitsing = git(['merge-base', base, 'HEAD']).trim();
    return driftWaarschuwing(git(['diff', '--name-only', '-z', afsplitsing]).split('\0').filter(Boolean));
  } catch {
    return `${base} is niet te lezen; docs-drift niet gecontroleerd (git fetch origin main of fetch-depth: 0)`;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const waarschuwing = driftVanRepo();
  if (waarschuwing === null) console.info('✓ check:docs-drift: docs sluiten aan op de wijziging in src/');
  else
    console.warn(
      process.env['GITHUB_ACTIONS'] === 'true' ? `::warning::${waarschuwing}` : `⚠ check:docs-drift: ${waarschuwing}`,
    );
}

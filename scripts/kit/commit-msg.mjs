// Commit-msg (lefthook.yml): de kop van een commitbericht volgt conventional commits (AGENTS.md, Repo en grenzen), bv.
// `fix(hooks): …`. Merge-, revert- en fixup-/squash-/amend-commits van git zelf mogen. Exit 1 met de reden bij een fout.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CONVENTIONAL = /^(feat|fix|docs|chore|test|refactor|perf|build|ci|style|revert)(\([a-z0-9][a-z0-9./-]*\))?!?: \S/;
const VAN_GIT = /^(Merge |Revert "|(fixup|squash|amend)! )/;

/**
 * @param {string} bericht
 * @returns {string | null} de fout, of null als de kop klopt
 */
export function commitFout(bericht) {
  const kop = bericht.split('\n').find((regel) => regel.trim() !== '' && !regel.startsWith('#')) ?? '';
  if (VAN_GIT.test(kop) || CONVENTIONAL.test(kop)) return null;
  return `commitkop "${kop}" volgt geen conventional commits: <type>(<scope>)?: <onderwerp>, met type feat, fix, docs, chore, test, refactor, perf, build, ci, style of revert en een scope in kleine letters, bv. \`fix(hooks): start every new branch from origin/main\``;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const bestand = process.argv[2];
  let fout;
  try {
    fout =
      bestand === undefined
        ? 'gebruik: node scripts/kit/commit-msg.mjs <bestand>'
        : commitFout(readFileSync(bestand, 'utf8'));
  } catch (error) {
    fout = `commitbericht onleesbaar: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (fout !== null) {
    console.error(`✗ commit-msg: ${fout}`);
    process.exitCode = 1;
  }
}

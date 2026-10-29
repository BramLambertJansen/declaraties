// check:migrations (AGENTS.md "Wijzig nooit een gecommitte migratie", framework §10): ten opzichte van het punt waar de branch
// van origin/main afsplitste mag een migratie alleen bijkomen; wijzigen, verwijderen of hernoemen faalt. Elke naam is
// `<14 cijfers>_<naam>.sql` en elk versienummer komt één keer voor (dbmate-tijdstempels; ook na `git merge template/main`).
// Is origin/main niet te lezen (bijv. een shallow checkout), dan faalt de check: onleesbaar telt als fout.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = 'db/migrations';
const BASE = 'origin/main';
const NAAM = /^(\d{14})_[a-z0-9_]+\.sql$/;

/** @typedef {{ status: string, pad: string }} Wijziging */

/**
 * @param {readonly Wijziging[]} wijzigingen uit `git diff --name-status --no-renames <afsplitsing>` op db/migrations
 * @param {readonly string[]} bestanden de namen in db/migrations nu
 * @returns {string[]}
 */
export function migratieRegels(wijzigingen, bestanden) {
  const gewijzigd = wijzigingen
    .filter(({ status }) => status !== 'A')
    .map(
      ({ status, pad }) =>
        `${pad}: ${status === 'D' ? 'verwijderd' : 'gewijzigd'}; maak een nieuwe migratie (expand/contract)`,
    );
  const sql = bestanden.filter((naam) => naam.endsWith('.sql'));
  const naamFouten = sql
    .filter((naam) => !NAAM.test(naam))
    .map((naam) => `${DIR}/${naam}: naam is niet <14 cijfers>_<naam>.sql (dbmate new <naam>)`);
  const versies = sql.map((naam) => NAAM.exec(naam)?.[1]).filter((versie) => versie !== undefined);
  const dubbel = [...new Set(versies.filter((versie, i) => versies.indexOf(versie) !== i))].map(
    (versie) => `versie ${versie} komt meer dan één keer voor`,
  );
  return [...gewijzigd, ...naamFouten, ...dubbel];
}

/**
 * @param {string} root
 * @param {readonly string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * @param {string} [root]
 * @param {string} [base]
 * @returns {string[]}
 */
export function migratieFouten(root = '.', base = BASE) {
  let afsplitsing;
  try {
    afsplitsing = git(root, ['merge-base', base, 'HEAD']).trim();
  } catch {
    return [`${base} is niet te lezen; haal hem op (git fetch origin main) of gebruik in CI fetch-depth: 0`];
  }
  const velden = git(root, ['diff', '--name-status', '-z', '--no-renames', afsplitsing, '--', DIR]).split('\0');
  /** @type {Wijziging[]} */
  const wijzigingen = [];
  for (let i = 0; i + 1 < velden.length; i += 2)
    wijzigingen.push({ status: velden[i] ?? '', pad: velden[i + 1] ?? '' });
  return migratieRegels(wijzigingen, readdirSync(path.join(root, DIR)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fouten = migratieFouten();
  if (fouten.length > 0) {
    console.error(`✗ check:migrations\n${fouten.map((fout) => `  - ${fout}`).join('\n')}`);
    process.exit(1);
  }
  console.info(`✓ check:migrations: geen gewijzigde of verwijderde migraties ten opzichte van ${BASE}, versies uniek`);
}

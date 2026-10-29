import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { migratieFouten, migratieRegels } from '../../scripts/kit/check-migrations.mjs';

// check:migrations (framework §10): bewijst dat de check faalt op een gewijzigde, verwijderde of hernoemde migratie, op een
// verkeerde naam en op een dubbel versienummer, en dat een nieuwe migratie of een branch die achterloopt op main groen is.
const EERSTE = '20261009000000_baseline.sql';
const TWEEDE = '20261010120000_notes.sql';

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    stdio: 'ignore',
  });
}

function migratie(root: string, naam: string, sql: string): void {
  writeFileSync(path.join(root, 'db/migrations', naam), sql);
}

// Een repo met één migratie op main, en een branch `werk` die daarvan afsplitst.
function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-migrations-'));
  mkdirSync(path.join(root, 'db/migrations'), { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  migratie(root, EERSTE, 'create table a ();\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'baseline');
  git(root, 'switch', '-q', '-c', 'werk');
  return root;
}

test('een nieuwe migratie is groen', () => {
  const root = repo();
  migratie(root, TWEEDE, 'create table b ();\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'notes');

  expect(migratieFouten(root, 'main')).toStrictEqual([]);
});

test('een branch die achterloopt op main is groen (vergelijkt met het afsplitspunt)', () => {
  const root = repo();
  git(root, 'switch', '-q', 'main');
  migratie(root, TWEEDE, 'create table b ();\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'notes op main');
  git(root, 'switch', '-q', 'werk');

  expect(migratieFouten(root, 'main')).toStrictEqual([]);
});

test.each([
  [
    'gewijzigd',
    (root: string) => {
      migratie(root, EERSTE, 'create table a (id int);\n');
    },
    `db/migrations/${EERSTE}: gewijzigd`,
  ],
  [
    'verwijderd',
    (root: string) => {
      rmSync(path.join(root, 'db/migrations', EERSTE));
    },
    `db/migrations/${EERSTE}: verwijderd`,
  ],
  [
    'hernoemd',
    (root: string) => {
      renameSync(path.join(root, 'db/migrations', EERSTE), path.join(root, 'db/migrations', TWEEDE));
    },
    `db/migrations/${EERSTE}: verwijderd`,
  ],
])('een gecommitte migratie %s (ook nog niet gecommit) faalt', (_, wijzig, fout) => {
  const root = repo();
  wijzig(root);

  expect(migratieFouten(root, 'main').map((regel) => regel.split(';')[0])).toStrictEqual([fout]);
});

test('zonder leesbare basis faalt de check', () => {
  expect(migratieFouten(repo(), 'origin/main')).toStrictEqual([
    'origin/main is niet te lezen; haal hem op (git fetch origin main) of gebruik in CI fetch-depth: 0',
  ]);
});

test('een verkeerde naam en een dubbel versienummer falen', () => {
  expect(migratieRegels([], [EERSTE, '20261009000000_dubbel.sql', 'notes.sql', 'README.md'])).toStrictEqual([
    'db/migrations/notes.sql: naam is niet <14 cijfers>_<naam>.sql (dbmate new <naam>)',
    'versie 20261009000000 komt meer dan één keer voor',
  ]);
});

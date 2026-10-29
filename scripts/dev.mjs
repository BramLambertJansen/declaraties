// Lokale ontwikkelomgeving (framework §11): Docker-check, .env.local uit .env.example, de stack (Postgres + Mailpit)
// via compose, migraties, daarna Hono (API) en Vite (web) naast elkaar; stopt allebei als er één stopt.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const ENV_FILE = '.env.local';

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} hint
 */
function step(command, args, hint) {
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  if (status !== 0) {
    console.error(`\n✗ ${[command, ...args].join(' ')} faalde.\n  → ${hint}`);
    process.exit(1);
  }
}

if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    '✗ Docker draait niet (of je zit niet in de groep docker).\n  → sudo systemctl start docker; daarna scripts/doctor.sh',
  );
  process.exit(1);
}

if (!existsSync(ENV_FILE)) {
  copyFileSync('.env.example', ENV_FILE);
  console.info(`${ENV_FILE} gemaakt uit .env.example (lokale demo-waarden).`);
}

step(
  'docker',
  ['compose', '--env-file', ENV_FILE, 'up', '-d', '--build', '--wait'],
  'docker compose --env-file .env.local logs postgres; zie docs/nieuwe-app.md, probleemtabel',
);
step('scripts/db-migrate.sh', [ENV_FILE, 'up'], 'lees de dbmate-fout hierboven; wijzig nooit een gecommitte migratie');
step(
  process.execPath,
  [`--env-file=${ENV_FILE}`, 'scripts/seed.mjs'],
  'lees de seed-fout hierboven (scripts/seed.mjs)',
);

const children = [
  spawn(process.execPath, [`--env-file-if-exists=${ENV_FILE}`, '--watch', 'src/api/server.ts'], { stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'vite'], { stdio: 'inherit' }),
];

let stopping = false;
/** @param {number} code */
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

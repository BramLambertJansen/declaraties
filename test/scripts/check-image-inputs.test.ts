import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');
const script = readFileSync(path.join(root, 'scripts/check-image.sh'), 'utf8');
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(dir: string, name: string, content: string) {
  const file = path.join(dir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function stub(dir: string, name: string, content: string) {
  write(dir, `stubs/${name}`, `#!/bin/bash\nset -euo pipefail\n${content}\n`);
  chmodSync(path.join(dir, 'stubs', name), 0o755);
}

function dockerStub(dir: string) {
  // Alleen dit synthetische script ziet de Docker-aanroepen. Het start geen containers.
  stub(
    dir,
    'docker',
    `if [[ "$1" == run && "$*" == *"--entrypoint id"* ]]; then echo 1000; exit 0; fi
if [[ "$1" == inspect ]]; then
  if [[ "$*" == *State.ExitCode* ]]; then echo 0; else echo PATH=/usr/bin; fi
  exit 0
fi
[[ "$1" == run && "$*" == *"@playwright/test/cli.js"* ]] || exit 0
touch "$STUB_DIR/browser-started"
record_mount() {
  printf '%s|%s|%s\\n' "$1" "$2" "$3" >> "$STUB_DIR/mounts"
  if [[ "$2" == /repo ]]; then
    printf '%s\\n' "$1" > "$STUB_DIR/snapshot"
    find "$1" -mindepth 1 ! -type d -printf '%P\\n' | sort > "$STUB_DIR/inputs"
    cat "$1/package.json" > "$STUB_DIR/package-content"
    cat "$1/e2e/prod-spa.smoke.spec.ts" > "$STUB_DIR/smoke-content"
  fi
}
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    -v|--volume) IFS=: read -r source target mode <<< "$2"; record_mount "$source" "$target" "$mode"; shift 2 ;;
    --volume=*) IFS=: read -r source target mode <<< "\${1#*=}"; record_mount "$source" "$target" "$mode"; shift ;;
    --mount)
      source=''; target=''; mode=rw
      IFS=, read -ra parts <<< "$2"
      for part in "\${parts[@]}"; do
        case "$part" in
          source=*|src=*) source="\${part#*=}" ;;
          target=*|dst=*|destination=*) target="\${part#*=}" ;;
          readonly|ro|readonly=true) mode=ro ;;
        esac
      done
      record_mount "$source" "$target" "$mode"; shift 2 ;;
    *) shift ;;
  esac
done
exit "\${STUB_BROWSER_EXIT:-0}"`,
  );
}

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-image-inputs-'));
  dirs.push(dir);
  write(dir, 'scripts/check-image.sh', script);
  write(dir, 'package.json', '{"name":"smoke-fixture","private":true}');
  write(dir, 'playwright.smoke.config.ts', 'export default { testDir: "e2e" };');
  write(dir, 'e2e/prod-spa.smoke.spec.ts', '// baseline smoke');
  write(dir, 'compose.yaml', 'services:\n  ui-runner:\n    image: mcr.microsoft.com/playwright:v1.63.0-noble\n');
  write(dir, '.gitignore', 'node_modules/\n.env*\n*.private\nstubs/\n');
  mkdirSync(path.join(dir, 'node_modules/@playwright/test'), { recursive: true });
  for (const args of [
    ['init', '-q'],
    ['add', '.'],
  ]) {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
  dockerStub(dir);
  stub(dir, 'timeout', '[[ "$1" != --kill-after=* ]] || shift\nshift\nexec "$@"');
  stub(
    dir,
    'curl',
    `case "\${!#}" in
  */api/health) printf '{"ok":true}' ;;
  */api/ready) printf 503 ;;
  */admin/accounts) printf "content-security-policy: default-src 'self'\\ncache-control: no-cache\\n" ;;
  */assets/*) printf 'cache-control: public, max-age=31536000, immutable\\n' ;;
  */api/bestaat-niet) printf '{"code":"NOT_FOUND","requestId":"fixture"}' ;;
  */) printf '<script src="/assets/fixture.js"></script>' ;;
  *) echo 'onverwachte curl-aanroep' >&2; exit 97 ;;
esac`,
  );
  return dir;
}

function run(dir: string, options: { browserExit?: number; scriptPath?: string } = {}) {
  const result = spawnSync('bash', [options.scriptPath ?? 'scripts/check-image.sh', 'app:fixture'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      HOME: dir,
      PATH: `${dir}/stubs:/usr/bin:/bin`,
      SMOKE_BROWSER: '1',
      STUB_DIR: `${dir}/stubs`,
      STUB_BROWSER_EXIT: String(options.browserExit ?? 0),
    },
  });
  const snapshotFile = path.join(dir, 'stubs/snapshot');
  // Ook bij een falende opruimassertie blijft er geen tijdelijke testprojectie achter.
  if (existsSync(snapshotFile)) dirs.push(readFileSync(snapshotFile, 'utf8').trim());
  return result;
}

test('browser-smoke leest alleen actuele smoke-invoer en afzonderlijke read-only dependencies', () => {
  const dir = fixture();
  write(dir, 'package.json', '{"name":"smoke-fixture-current","private":true}');
  write(dir, 'e2e/prod-spa.smoke.spec.ts', '// actuele smoke');
  write(dir, 'e2e/nested/extra.smoke.spec.ts', '// nieuwe smoke');
  write(dir, '.gitignore', 'node_modules/\n.env*\n*.private\nstubs/\ne2e/ignored/\n');
  write(dir, 'e2e/ignored/private.smoke.spec.ts', '// genegeerde smoke');
  write(dir, 'e2e/.env.local/private.smoke.spec.ts', '// geheim in een env-map');
  const tracked = spawnSync('git', ['add', '-f', 'e2e/.env.local'], { cwd: dir, encoding: 'utf8' });
  if (tracked.status !== 0) throw new Error(tracked.stderr);
  for (const name of ['.env', '.env.local', '.env.example', 'notes.md', 'secret.private', 'e2e/token.private']) {
    write(dir, name, 'synthetisch geheim');
  }
  write(dir, 'e2e/other.spec.ts', '// geen smoke');
  write(dir, 'src/private.ts', '// niet nodig voor de smoke');

  const result = run(dir);

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(readFileSync(path.join(dir, 'stubs/inputs'), 'utf8').trim().split('\n')).toEqual([
    'e2e/nested/extra.smoke.spec.ts',
    'e2e/prod-spa.smoke.spec.ts',
    'package.json',
    'playwright.smoke.config.ts',
  ]);
  const snapshot = readFileSync(path.join(dir, 'stubs/snapshot'), 'utf8').trim();
  expect(readFileSync(path.join(dir, 'stubs/mounts'), 'utf8').trim().split('\n')).toEqual(
    expect.arrayContaining([`${snapshot}|/repo|ro`, `${dir}/node_modules|/repo/node_modules|ro`]),
  );
  expect(readFileSync(path.join(dir, 'stubs/package-content'), 'utf8')).toContain('smoke-fixture-current');
  expect(readFileSync(path.join(dir, 'stubs/smoke-content'), 'utf8')).toBe('// actuele smoke');
});

test.each([0, 23])('tijdelijke smoke-projectie verdwijnt na browser-exit %s', (browserExit) => {
  const dir = fixture();

  const result = run(dir, { browserExit });

  expect(result.status).toBe(browserExit === 0 ? 0 : 1);
  if (browserExit !== 0) expect(result.stderr).toContain('browser-smoke van de productie-SPA faalt');
  const snapshot = readFileSync(path.join(dir, 'stubs/snapshot'), 'utf8').trim();
  expect(existsSync(snapshot)).toBe(false);
  expect(existsSync(path.join(dir, 'package.json'))).toBe(true);
  expect(existsSync(path.join(dir, 'node_modules/@playwright/test'))).toBe(true);
});

test.each(['package.json', 'playwright.smoke.config.ts', 'e2e', 'e2e/prod-spa.smoke.spec.ts', 'node_modules'])(
  'weigert een symlink in de geselecteerde smoke-invoer: %s',
  (name) => {
    const dir = fixture();
    const target = path.join(dir, 'symlink-target');
    renameSync(path.join(dir, name), target);
    symlinkSync(target, path.join(dir, name));

    const result = run(dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/symlink|veilig pad/);
    expect(existsSync(path.join(dir, 'stubs/browser-started'))).toBe(false);
  },
);

test('weigert een symlinkouder van een genest smoke-bestand', () => {
  const dir = fixture();
  write(dir, 'e2e/linked/nested.smoke.spec.ts', '// getrackte smoke');
  const tracked = spawnSync('git', ['add', 'e2e/linked'], { cwd: dir, encoding: 'utf8' });
  if (tracked.status !== 0) throw new Error(tracked.stderr);
  rmSync(path.join(dir, 'e2e/linked'), { recursive: true });
  write(dir, 'outside/nested.smoke.spec.ts', '// bron buiten e2e');
  symlinkSync(path.join(dir, 'outside'), path.join(dir, 'e2e/linked'));

  const result = run(dir);

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/symlink|veilig pad/);
  expect(existsSync(path.join(dir, 'stubs/browser-started'))).toBe(false);
});

test('weigert een repository die via een symlink wordt aangesproken', () => {
  const dir = fixture();
  const outside = mkdtempSync(path.join(tmpdir(), 'check-image-link-'));
  dirs.push(outside);
  const linked = path.join(outside, 'repo');
  symlinkSync(dir, linked);

  const result = run(dir, { scriptPath: path.join(linked, 'scripts/check-image.sh') });

  expect(result.status).toBe(1);
  expect(result.stderr).toMatch(/symlink|veilig pad/);
  expect(existsSync(path.join(dir, 'stubs/browser-started'))).toBe(false);
});

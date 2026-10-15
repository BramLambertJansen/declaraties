import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// scripts/cloud-setup.sh (README, Cloud): het setup-script van een cloudomgeving, met mise en curl als stubs op PATH.
// De stubs schrijven hun aanroep naar een log; niets installeert echt en er gaat niets over het netwerk.
const SCRIPT = path.join(import.meta.dirname, '../../scripts/cloud-setup.sh');
const dirs: string[] = [];

type Opstelling = { home: string; stubs: string; log: string; systeem: boolean };

function stub(dir: string, name: string, body: string) {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

// mise-stub: logt de argumenten; faalt als MISE_FAIL in de argumenten voorkomt.
const MISE = 'echo "mise $*" >> "$STUB_LOG"; [[ " $* " != *" $MISE_FAIL "* ]] || exit 3';

// Opties: metMise (mise al aanwezig) en metSandbox (bwrap en socat al aanwezig); zonder sandbox hoeven ze niet te bestaan op PATH.
function opstelling({ metMise, metSandbox = true }: { metMise: boolean; metSandbox?: boolean }): Opstelling {
  const root = mkdtempSync(path.join(tmpdir(), 'cloud-setup-'));
  dirs.push(root);
  const home = path.join(root, 'home');
  const stubs = path.join(root, 'stubs');
  const log = path.join(root, 'log');
  mkdirSync(home);
  mkdirSync(stubs);
  writeFileSync(log, '');
  if (metMise) stub(stubs, 'mise', MISE);
  // curl-stub: schrijft een mise-stub naar het doel van -o, zoals de echte de release-binary.
  stub(
    stubs,
    'curl',
    [
      'echo "curl $*" >> "$STUB_LOG"',
      'while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && { doel="$2"; shift; }; shift; done',
      `printf '%s\\n' '#!/usr/bin/env bash' '${MISE}' > "$doel"`,
    ].join('\n'),
  );
  stub(stubs, 'apt-get', 'echo "apt-get $*" >> "$STUB_LOG"');
  stub(stubs, 'sudo', 'exec "$@"');
  if (metSandbox) {
    stub(stubs, 'bwrap', 'true');
    stub(stubs, 'socat', 'true');
    return { home, stubs, log, systeem: true };
  }
  // Zonder sandbox-pakketten: PATH krijgt alleen symlinks naar de tools die het script gebruikt, niet /usr/bin zelf.
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  for (const tool of ['bash', 'uname', 'mkdir', 'chmod', 'grep', 'touch', 'dirname', 'id'])
    symlinkSync(execFileSync('which', [tool], { encoding: 'utf8' }).trim(), path.join(bin, tool));
  return { home, stubs, log, systeem: false };
}

function run({ home, stubs, log, systeem }: Opstelling, extra: Record<string, string> = {}) {
  const basis = systeem ? '/usr/bin:/bin' : path.join(path.dirname(stubs), 'bin');
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { HOME: home, PATH: `${stubs}:${basis}`, STUB_LOG: log, MISE_FAIL: '__nooit__', ...extra },
  });
  return { status: result.status, aanroepen: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const STAPPEN = [
  'mise trust',
  'mise install',
  'mise exec -- pnpm install --frozen-lockfile',
  'mise exec -- pnpm exec lefthook install',
];

describe('scripts/cloud-setup.sh', () => {
  test('met mise en sandbox-pakketten: trust, install, pnpm install --frozen-lockfile en lefthook install, in die volgorde; geen curl', () => {
    const omgeving = opstelling({ metMise: true });

    expect(run(omgeving)).toStrictEqual({ status: 0, aanroepen: STAPPEN });
  });

  test('zonder mise: haalt de gepinde release van github.com (niet mise.run) en gaat dan verder', () => {
    const omgeving = opstelling({ metMise: false });
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

    const { status, aanroepen } = run(omgeving);

    expect(status).toBe(0);
    expect(aanroepen).toStrictEqual([
      // Zelfde versie als jdx/mise-action in .github/workflows/ci.yml; mise.run staat niet op de allowlist van de cloud.
      `curl -fsSL -o ${omgeving.home}/.local/bin/mise https://github.com/jdx/mise/releases/download/v2026.9.18/mise-v2026.9.18-linux-${arch}`,
      ...STAPPEN,
    ]);
    expect(existsSync(path.join(omgeving.home, '.local/bin/mise'))).toBe(true);
  });

  test('idempotent: twee keer draaien zet de PATH-regel één keer in ~/.bashrc en installeert mise één keer', () => {
    const omgeving = opstelling({ metMise: false });

    run(omgeving);
    const tweede = run(omgeving);

    const bashrc = readFileSync(path.join(omgeving.home, '.bashrc'), 'utf8');
    expect(bashrc.match(/mise\/shims/g)).toHaveLength(1);
    expect(tweede.status).toBe(0);
    expect(tweede.aanroepen.filter((regel) => regel.startsWith('curl'))).toHaveLength(1);
  });

  test('zonder bubblewrap en socat: apt-get update en install vóór de rest; met beide aanwezig geen apt-get', () => {
    const omgeving = opstelling({ metMise: true, metSandbox: false });
    const { status, aanroepen } = run(omgeving);

    expect(status).toBe(0);
    expect(aanroepen).toStrictEqual(['apt-get update', 'apt-get install -y bubblewrap socat', ...STAPPEN]);
  });

  test('een falende stap stopt het script met een fout', () => {
    const omgeving = opstelling({ metMise: true });

    const { status, aanroepen } = run(omgeving, { MISE_FAIL: 'install' });

    expect(status).not.toBe(0);
    expect(aanroepen).toStrictEqual(['mise trust', 'mise install']);
  });

  test('bevat geen geheimen of tokens en draait geen doctor of docker', () => {
    const bron = readFileSync(SCRIPT, 'utf8');

    expect(bron).not.toMatch(/token|secret|GH_|GITHUB_|docker|doctor\.sh/i);
  });
});

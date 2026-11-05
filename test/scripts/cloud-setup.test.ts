import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  statSync,
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
// Terugval (docs/ENVIRONMENT.md): MISE_ONTBREEKT noemt tools waarvoor `mise where` faalt, MISE_BLIJFT_ONTBREKEN is de
// uitvoer van `mise ls --missing`; `mise current` geeft voor elke tool 9.9.9.
const SCRIPT = path.join(import.meta.dirname, '../../scripts/cloud-setup.sh');
const dirs: string[] = [];

type Opstelling = { home: string; stubs: string; log: string; systeem: boolean };

function stub(dir: string, name: string, body: string) {
  const file = path.join(dir, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

// mise-stub: logt de argumenten; faalt als MISE_FAIL in de argumenten voorkomt of bij MISE_INSTALL_FAIL op `mise install`. Zonder enkele aanhalingstekens: de
// curl-stub schrijft hem tussen enkele aanhalingstekens weg.
const MISE = [
  'echo "mise $*" >> "$STUB_LOG"; [[ " $* " != *" $MISE_FAIL "* ]] || exit 3',
  // Alleen de kale `mise install`, niet pnpm install of lefthook install.
  '[[ -z "${MISE_INSTALL_FAIL:-}" || "$*" != install ]] || exit 3',
  'case "$1" in',
  '  current) echo 9.9.9 ;;',
  '  where) [[ " ${MISE_ONTBREEKT:-} " != *" $2 "* ]] || exit 1 ;;',
  '  ls) echo -n "${MISE_BLIJFT_ONTBREKEN:-}" ;;',
  'esac',
].join('\n');

// Inhoud van elke stub-download die geen mise of checksumbestand is, en de hash die het checksumbestand ervoor noemt.
const PAYLOAD = 'payload';
const PAYLOAD_SHA = createHash('sha256').update(PAYLOAD).digest('hex');

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
  // curl-stub: voor de mise-release een mise-stub, zoals de echte de release-binary; voor een checksumbestand een regel
  // met CURL_HASH (standaard de hash van PAYLOAD) en de naam van de vorige download; anders PAYLOAD.
  stub(
    stubs,
    'curl',
    [
      'echo "curl $*" >> "$STUB_LOG"',
      '[[ -z "${CURL_FAIL:-}" ]] || exit 22',
      'url="${!#}"',
      'while [[ $# -gt 0 ]]; do [[ "$1" == -o ]] && { doel="$2"; shift; }; shift; done',
      'case "$url" in',
      `  */jdx/mise/*) printf '%s\\n' '#!/usr/bin/env bash' '${MISE}' > "$doel" ;;`,
      `  *SHASUMS256.txt | *checksums.txt | *_SHA256SUMS) printf '%s  %s\\n' "$CURL_HASH" "$(cat "$STUB_LOG.asset")" > "$doel" ;;`,
      `  *) printf '${PAYLOAD}' > "$doel"; echo -n "\${url##*/}" > "$STUB_LOG.asset" ;;`,
      'esac',
    ].join('\n'),
  );
  stub(stubs, 'tar', 'echo "tar $*" >> "$STUB_LOG"');
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
  for (const tool of ['bash', 'uname', 'mkdir', 'chmod', 'grep', 'touch', 'dirname', 'id', 'rm'])
    symlinkSync(execFileSync('which', [tool], { encoding: 'utf8' }).trim(), path.join(bin, tool));
  return { home, stubs, log, systeem: false };
}

function run({ home, stubs, log, systeem }: Opstelling, extra: Record<string, string> = {}) {
  const basis = systeem ? '/usr/bin:/bin' : path.join(path.dirname(stubs), 'bin');
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      HOME: home,
      PATH: `${stubs}:${basis}`,
      STUB_LOG: log,
      MISE_FAIL: '__nooit__',
      CURL_HASH: PAYLOAD_SHA,
      ...extra,
    },
  });
  return { status: result.status, aanroepen: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) };
}

// Zoals run, met ook stderr, voor de meldingen bij een mislukte stap.
function runMetStderr({ home, stubs, log }: Opstelling, extra: Record<string, string>) {
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      HOME: home,
      PATH: `${stubs}:/usr/bin:/bin`,
      STUB_LOG: log,
      MISE_FAIL: '__nooit__',
      CURL_HASH: PAYLOAD_SHA,
      ...extra,
    },
  });
  return {
    status: result.status,
    stderr: result.stderr,
    aanroepen: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const TOOLS = ['node', 'pnpm', 'dbmate', 'betterleaks', 'osv-scanner'];
const NA_INSTALL: unknown[] = [
  ...TOOLS.map((tool) => `mise where ${tool}`),
  'mise ls --missing',
  'mise exec -- pnpm install --frozen-lockfile',
  'mise exec -- pnpm exec lefthook install',
  // Bewijs aan het eind: de voorcontrole van scripts/kit/toolchain.mjs.
  expect.stringMatching(/^mise exec -- node --input-type=module -e .*scripts\/kit\/toolchain\.mjs/),
];
const STAPPEN: unknown[] = ['mise trust', 'mise install', ...NA_INSTALL];
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

describe('scripts/cloud-setup.sh', () => {
  test('met mise en sandbox-pakketten: trust, install, pnpm install --frozen-lockfile en lefthook install, in die volgorde; geen curl', () => {
    const omgeving = opstelling({ metMise: true });

    expect(run(omgeving)).toStrictEqual({ status: 0, aanroepen: STAPPEN });
  });

  test('zonder mise: haalt de gepinde release van github.com (niet mise.run) en gaat dan verder', () => {
    const omgeving = opstelling({ metMise: false });

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

    const { status, aanroepen } = run(omgeving, { MISE_FAIL: 'lefthook' });

    expect(status).not.toBe(0);
    expect(aanroepen).toStrictEqual(STAPPEN.slice(0, -1));
  });

  test('mislukte mise install met alle tools toch aanwezig: melding, geen terugval, verder als normaal', () => {
    const omgeving = opstelling({ metMise: true });

    const { status, stderr, aanroepen } = runMetStderr(omgeving, { MISE_INSTALL_FAIL: '1' });

    expect(status).toBe(0);
    expect(stderr).toContain('terugval');
    expect(aanroepen).toStrictEqual(STAPPEN);
  });

  test('terugval: ontbrekende tools exact op de versie uit mise.toml, met checksum, daarna mise link', () => {
    const omgeving = opstelling({ metMise: true });
    const doel = (tool: string) => `${omgeving.home}/.local/share/mise-terugval/${tool}-9.9.9`;
    const link = (tool: string) => `mise link --force ${tool}@9.9.9 ${doel(tool)}`;
    const npm = (tool: string) =>
      `mise exec node -- npm install --global --prefix ${doel(tool)} --no-fund --no-audit ${tool}@9.9.9`;
    const curl = (url: string): unknown =>
      expect.stringMatching(new RegExp(`^curl -fsSL -o \\S+ ${url.replaceAll('.', '\\.')}$`));
    const node = 'https://nodejs.org/dist/v9.9.9';
    const bl = 'https://github.com/betterleaks/betterleaks/releases/download/v9.9.9';
    const osv = 'https://github.com/google/osv-scanner/releases/download/v9.9.9';

    const { status, aanroepen } = run(omgeving, { MISE_INSTALL_FAIL: '1', MISE_ONTBREEKT: TOOLS.join(' ') });

    expect(status).toBe(0);
    expect(aanroepen).toStrictEqual([
      'mise trust',
      'mise install',
      'mise where node',
      'mise current node',
      curl(`${node}/node-v9.9.9-linux-${arch}.tar.gz`),
      curl(`${node}/SHASUMS256.txt`),
      expect.stringMatching(new RegExp(`^tar -xzf \\S+ -C ${doel('node')} --strip-components=1$`)),
      link('node'),
      'mise where pnpm',
      'mise current pnpm',
      npm('pnpm'),
      link('pnpm'),
      'mise where dbmate',
      'mise current dbmate',
      npm('dbmate'),
      link('dbmate'),
      'mise where betterleaks',
      'mise current betterleaks',
      curl(`${bl}/betterleaks_9.9.9_linux_${arch}.tar.gz`),
      curl(`${bl}/checksums.txt`),
      expect.stringMatching(new RegExp(`^tar -xzf \\S+ -C ${doel('betterleaks')} betterleaks$`)),
      link('betterleaks'),
      'mise where osv-scanner',
      'mise current osv-scanner',
      curl(`${osv}/osv-scanner_linux_${arch === 'x64' ? 'amd64' : 'arm64'}`),
      curl(`${osv}/osv-scanner_SHA256SUMS`),
      link('osv-scanner'),
      ...NA_INSTALL.slice(TOOLS.length),
    ]);
    expect(statSync(path.join(doel('osv-scanner'), 'osv-scanner')).mode & 0o111).not.toBe(0);
  });

  test('terugval: checksum klopt niet → status ≠ 0, melding, geen mise link en geen pnpm install', () => {
    const omgeving = opstelling({ metMise: true });

    const { status, stderr, aanroepen } = runMetStderr(omgeving, {
      MISE_ONTBREEKT: 'betterleaks',
      CURL_HASH: '0'.repeat(64),
    });

    expect(status).not.toBe(0);
    expect(stderr).toContain('checksum van betterleaks_9.9.9');
    expect(aanroepen.filter((regel) => regel.startsWith('mise link') || regel.includes('pnpm install'))).toStrictEqual(
      [],
    );
  });

  test('terugval: download mislukt → status ≠ 0 en melding met Trusted en docs/ENVIRONMENT.md', () => {
    const omgeving = opstelling({ metMise: true });

    const { status, stderr } = runMetStderr(omgeving, { MISE_ONTBREEKT: 'node', CURL_FAIL: '1' });

    expect(status).not.toBe(0);
    expect(stderr).toContain('Trusted');
    expect(stderr).toContain('docs/ENVIRONMENT.md');
  });

  test('ontbreekt na de terugval nog een tool uit mise.toml: status ≠ 0, tool genoemd, geen pnpm install', () => {
    const omgeving = opstelling({ metMise: true });

    const { status, stderr, aanroepen } = runMetStderr(omgeving, {
      MISE_BLIJFT_ONTBREKEN: 'nieuwtool 1.0.0 (missing)',
    });

    expect(status).not.toBe(0);
    expect(stderr).toContain('nieuwtool');
    expect(aanroepen.filter((regel) => regel.includes('pnpm install'))).toStrictEqual([]);
  });

  test('mislukte curl van mise: status ≠ 0, melding met Trusted en docs/ENVIRONMENT.md, daarna geen mise-aanroep', () => {
    const omgeving = opstelling({ metMise: false });

    const { status, stderr, aanroepen } = runMetStderr(omgeving, { CURL_FAIL: '1' });

    expect(status).not.toBe(0);
    expect(stderr).toContain('Trusted');
    expect(stderr).toContain('docs/ENVIRONMENT.md');
    expect(aanroepen.filter((regel) => regel.startsWith('mise'))).toStrictEqual([]);
  });

  test('mislukte pnpm install: status ≠ 0 en melding met Trusted en docs/ENVIRONMENT.md', () => {
    const omgeving = opstelling({ metMise: true });

    const { status, stderr } = runMetStderr(omgeving, { MISE_FAIL: '--frozen-lockfile' });

    expect(status).not.toBe(0);
    expect(stderr).toContain('Trusted');
    expect(stderr).toContain('docs/ENVIRONMENT.md');
  });

  test('bevat geen geheimen of tokens en draait geen doctor of docker', () => {
    const bron = readFileSync(SCRIPT, 'utf8');

    expect(bron).not.toMatch(/token|secret|GH_|GITHUB_|docker|doctor\.sh/i);
  });
});

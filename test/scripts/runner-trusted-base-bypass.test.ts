import { spawnSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// PR 3, review: runner.sh verdedigt zichzelf, ongeacht hoe hij gestart wordt. Omzeilingen van de vertrouwde basis (echte
// refs/heads/main bij de remote): git-config via de omgeving, GIT_DIR, git replace, lokale config, een gelijkende branchnaam
// en een ontbrekende stat. Temp-repo met bare origin, zoals runner-trusted-base.test.ts.
const SCRIPT = readFileSync(path.join(import.meta.dirname, '../../scripts/runner.sh'), 'utf8');
const OVERRIDE = ['--sta-wijzigingen', 'toe'].join('-');
const dirs: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commitFile(repo: string, rel: string, text: string): void {
  mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  writeFileSync(path.join(repo, rel), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', rel);
}

interface Omgeving {
  repo: string;
  stubs: string;
  bare: string;
  /** Commit A: main bij de echte origin. */
  basis: string;
}

/** origin (bare) staat op main = A; lokaal staat HEAD (feat/x) op A. */
function maakRepo(): Omgeving {
  const repo = tmp('runner-bp-');
  const stubs = tmp('runner-bp-stubs-');
  const bare = tmp('runner-bp-bare-');
  git(repo, 'init', '-q', '-b', 'main');
  commitFile(repo, 'scripts/runner.sh', SCRIPT);
  commitFile(repo, 'compose.yaml', 'services: {}\n');
  commitFile(repo, 'package.json', '{}\n');
  writeFileSync(path.join(stubs, 'docker'), '#!/usr/bin/env bash\necho "docker $*" >> "$STUB_DIR/log"\n');
  chmodSync(path.join(stubs, 'docker'), 0o755);
  writeFileSync(path.join(stubs, 'log'), '');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(repo, 'remote', 'add', 'origin', bare);
  git(repo, 'push', '-q', 'origin', 'main');
  git(repo, 'fetch', '-q', 'origin');
  const basis = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'feat/x');
  return { repo, stubs, bare, basis };
}

/** Een gewijzigde compose.yaml, gecommit boven op A: de afwijking die de runner moet zien. */
function wijzigCompose(omgeving: Omgeving): string {
  commitFile(omgeving.repo, 'compose.yaml', 'services:\n  evil: {}\n');
  return git(omgeving.repo, 'rev-parse', 'HEAD');
}

/** Een tweede bare repo waarvan main = `sha` (een commit uit `omgeving.repo`). */
function nepRemote(omgeving: Omgeving, sha: string): string {
  const nep = tmp('runner-bp-nep-');
  git(nep, 'init', '-q', '--bare', '-b', 'main');
  git(omgeving.repo, 'push', '-q', nep, `${sha}:refs/heads/main`);
  return nep;
}

function run(
  omgeving: Omgeving,
  env: Record<string, string> = {},
  opties: { flag?: string | undefined; pad?: string; zonderGlobaal?: boolean } = {},
) {
  const args = ['scripts/runner.sh', 'ui', ...(opties.flag === undefined ? [] : [opties.flag])];
  const gitEnvZonderGlobaal = Object.fromEntries(Object.entries(GIT_ENV).filter(([k]) => k !== 'GIT_CONFIG_GLOBAL'));
  const result = spawnSync('bash', args, {
    cwd: omgeving.repo,
    encoding: 'utf8',
    env: {
      HOME: omgeving.stubs,
      PATH: opties.pad ?? `${omgeving.stubs}:/usr/bin:/bin`,
      STUB_DIR: omgeving.stubs,
      TMPDIR: tmpdir(),
      // zonderGlobaal: git leest dan HOME/XDG_CONFIG_HOME zelf, zoals bij een echte start.
      ...(opties.zonderGlobaal === true ? gitEnvZonderGlobaal : GIT_ENV),
      ...env,
    },
  });
  const reachedDocker = readFileSync(path.join(omgeving.stubs, 'log'), 'utf8').length > 0;
  return { status: result.status, stderr: result.stderr, reachedDocker };
}

/** Een globale gitconfig onder een eigen HOME; GIT_CONFIG_GLOBAL wijst ernaar (de testomgeving zet hem anders op /dev/null). */
function globaleConfig(omgeving: Omgeving, inhoud: string): Record<string, string> {
  const home = path.join(omgeving.stubs, 'h');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, '.gitconfig'), inhoud);
  return { HOME: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig') };
}

const WEIGERT = { status: 1, reachedDocker: false };
const uitkomst = (r: { status: number | null; reachedDocker: boolean }) => ({
  status: r.status,
  reachedDocker: r.reachedDocker,
});

describe('runner.sh: omzeilingen van de vertrouwde basis', () => {
  test('1. GIT_CONFIG_COUNT met url.<nep>.insteadOf naar een tweede remote met een andere main: geweigerd', () => {
    const omgeving = maakRepo();
    const nep = nepRemote(omgeving, wijzigCompose(omgeving));

    const resultaat = run(omgeving, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.${nep}.insteadOf`,
      GIT_CONFIG_VALUE_0: omgeving.bare,
    });

    expect(uitkomst(resultaat)).toStrictEqual(WEIGERT);
  });

  test('2. GIT_DIR naar een andere repo met een eigen origin: genegeerd of dicht gefaald', () => {
    const omgeving = maakRepo();
    const sha = wijzigCompose(omgeving);
    const nep = nepRemote(omgeving, sha);
    const andere = tmp('runner-bp-andere-');
    git(andere, 'clone', '-q', omgeving.repo, '.');
    git(andere, 'checkout', '-q', 'feat/x');
    git(andere, 'remote', 'set-url', 'origin', nep);

    const resultaat = run(omgeving, { GIT_DIR: path.join(andere, '.git') });

    expect(uitkomst(resultaat)).toStrictEqual(WEIGERT);
  });

  test('3. git replace <main> <HEAD>: de runner ziet toch de gewijzigde compose.yaml', () => {
    const omgeving = maakRepo();
    const sha = wijzigCompose(omgeving);
    git(omgeving.repo, 'replace', omgeving.basis, sha);

    const resultaat = run(omgeving);

    // Weigeren volstaat: dicht falen ("ontbreekt lokaal") of de afwijking zien zijn beide goed.
    expect(uitkomst(resultaat)).toStrictEqual(WEIGERT);
  });

  // Herziene eis (herreview PR 3): de runner weigert niet elke insteadOf/include, maar eist dat remote.origin.url precies één
  // waarde heeft, uit de lokale .git/config, en dat `git ls-remote --get-url origin` daar gelijk aan is. Alleen wat de
  // origin-url werkelijk verlegt, faalt dicht.
  test('4a. een insteadOf die de origin-url verandert (get-url wijkt af van de config): dicht falen met melding', () => {
    const omgeving = maakRepo();
    const nep = nepRemote(omgeving, wijzigCompose(omgeving));
    git(omgeving.repo, 'config', '--local', `url.${nep}.insteadOf`, omgeving.bare);

    const resultaat = run(omgeving);

    expect(uitkomst(resultaat)).toStrictEqual(WEIGERT);
    expect(resultaat.stderr).toMatch(/origin|remote|insteadOf|url/i);
  });

  test('4b. een insteadOf die de origin-url niet raakt (andere host): toegestaan, runner werkt normaal', () => {
    const omgeving = maakRepo();
    git(omgeving.repo, 'config', '--local', 'url.https://elders.example/.insteadOf', 'https://x.example/');

    expect(uitkomst(run(omgeving))).toStrictEqual({ status: 0, reachedDocker: true });
  });

  test('4c. een includeIf in de globale config zonder remote-instellingen: toegestaan', () => {
    const omgeving = maakRepo();
    const leeg = path.join(omgeving.stubs, 'leeg.config');
    writeFileSync(leeg, '[core]\n\tabbrev = 8\n');
    const global = globaleConfig(omgeving, `[includeIf "gitdir:/x/"]\n\tpath = ${leeg}\n`);

    expect(uitkomst(run(omgeving, global))).toStrictEqual({ status: 0, reachedDocker: true });
  });

  test('4d. een lokale include.path die een tweede remote.origin.url zet (niet uit .git/config): dicht falen', () => {
    const omgeving = maakRepo();
    const nep = nepRemote(omgeving, wijzigCompose(omgeving));
    const extra = path.join(omgeving.stubs, 'extra.config');
    writeFileSync(extra, `[remote "origin"]\n\turl = ${nep}\n`);
    git(omgeving.repo, 'config', '--local', 'include.path', extra);

    expect(uitkomst(run(omgeving))).toStrictEqual(WEIGERT);
  });

  test('4e. remote.origin.url in de globale config (via HOME) naar een nep-remote met gewijzigde compose: dicht falen', () => {
    const omgeving = maakRepo();
    const nep = nepRemote(omgeving, wijzigCompose(omgeving));
    const global = globaleConfig(omgeving, `[remote "origin"]\n\turl = ${nep}\n`);

    expect(uitkomst(run(omgeving, global))).toStrictEqual(WEIGERT);
  });

  test.each([
    { naam: 'CI=true', env: { CI: 'true' }, flag: undefined },
    { naam: 'de override-vlag', env: {}, flag: OVERRIDE },
  ])('4f. met $naam draait de configcontrole niet: een globale insteadOf blijft het gedrag niet wijzigen', (geval) => {
    const omgeving = maakRepo();
    const nep = nepRemote(omgeving, wijzigCompose(omgeving));
    const global = globaleConfig(omgeving, `[url "${nep}"]\n\tinsteadOf = ${omgeving.bare}\n`);

    const resultaat = run(omgeving, { ...global, ...geval.env }, { flag: geval.flag });

    expect(uitkomst(resultaat)).toStrictEqual({ status: 0, reachedDocker: true });
  });

  test('5. origin heeft ook fix/refs/heads/main met een andere sha: de basis is de echte refs/heads/main', () => {
    const omgeving = maakRepo();
    const sha = wijzigCompose(omgeving);
    git(omgeving.repo, 'push', '-q', 'origin', `${sha}:refs/heads/fix/refs/heads/main`);

    const resultaat = run(omgeving);

    expect(uitkomst(resultaat)).toStrictEqual(WEIGERT);
    expect(resultaat.stderr).toContain('compose.yaml');
  });
});

describe('runner.sh: transportcommando uit de globale config verlegt de origin niet ongezien', () => {
  /** nep-ssh draait git upload-pack op een nep-remote waarvan main = HEAD met gewijzigde compose.yaml, ongeacht de argumenten. */
  function nepSsh(omgeving: Omgeving): string {
    const nep = nepRemote(omgeving, wijzigCompose(omgeving));
    const ssh = path.join(omgeving.stubs, 'nep-ssh');
    writeFileSync(ssh, `#!/bin/sh\nexec git upload-pack '${nep}'\n`);
    chmodSync(ssh, 0o755);
    // Geen netwerk in de test: negeert de runner de nep-sshCommand terecht, dan mag git nooit een echte ssh
    // bereiken (hangt op hosts met ssh-config tot de runner-timeout). Deze stub faalt direct.
    const echteSsh = path.join(omgeving.stubs, 'ssh');
    writeFileSync(echteSsh, '#!/bin/sh\necho "ssh: geblokkeerd in test (geen netwerk)" >&2\nexit 255\n');
    chmodSync(echteSsh, 0o755);
    git(omgeving.repo, 'remote', 'set-url', 'origin', 'git@example.invalid:o/r.git');
    return ssh;
  }

  test('core.sshCommand in $HOME/.gitconfig: de runner bereikt docker niet', () => {
    const omgeving = maakRepo();
    const ssh = nepSsh(omgeving);
    const home = path.join(omgeving.stubs, 'h');
    mkdirSync(home);
    writeFileSync(path.join(home, '.gitconfig'), `[core]\n\tsshCommand = ${ssh}\n`);

    const resultaat = run(omgeving, { HOME: home }, { zonderGlobaal: true });

    expect(resultaat.status).not.toBe(0);
    expect(resultaat.reachedDocker).toBe(false);
  });

  test('core.sshCommand in $XDG_CONFIG_HOME/git/config: de runner bereikt docker niet', () => {
    const omgeving = maakRepo();
    const ssh = nepSsh(omgeving);
    const xdg = path.join(omgeving.stubs, 'x');
    mkdirSync(path.join(xdg, 'git'), { recursive: true });
    writeFileSync(path.join(xdg, 'git/config'), `[core]\n\tsshCommand = ${ssh}\n`);

    const resultaat = run(omgeving, { XDG_CONFIG_HOME: xdg }, { zonderGlobaal: true });

    expect(resultaat.status).not.toBe(0);
    expect(resultaat.reachedDocker).toBe(false);
  });
});

describe('runner.sh: hardlinkcontrole faalt dicht', () => {
  test('6. een falende stat laat een niet-getrackt hardlink-invoerbestand niet door', () => {
    const omgeving = maakRepo();
    writeFileSync(path.join(omgeving.repo, '.gitignore'), '.runner-output/\n');
    mkdirSync(path.join(omgeving.repo, 'src'));
    writeFileSync(path.join(omgeving.stubs, 'geheim.txt'), 'synthetisch');
    linkSync(path.join(omgeving.stubs, 'geheim.txt'), path.join(omgeving.repo, 'src/link.ts'));
    writeFileSync(path.join(omgeving.stubs, 'stat'), '#!/usr/bin/env bash\nexit 1\n');
    chmodSync(path.join(omgeving.stubs, 'stat'), 0o755);

    const resultaat = run(omgeving, {}, { flag: OVERRIDE });

    expect(uitkomst(resultaat)).toStrictEqual(WEIGERT);
  });
});

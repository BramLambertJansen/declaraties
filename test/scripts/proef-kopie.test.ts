import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { draaiNode, git, maakBron, MODULE, nieuweWerkmap, overgebleven, ROOT } from './proef-fixture';

// scripts/kit/proef-kopie.mjs (docs/specs/app-init-proef.md, OV-3): gedeeld door check:app-init en check:new-resource.
// Contract voor deze tests:
//   kopie(bron: string, prefix: string): string          synchroon; map direct onder os.tmpdir(), naam begint met prefix;
//                                                          inhoud = git ls-files --cached --others --exclude-standard (bestanden
//                                                          die op schijf ontbreken overgeslagen) + symlink node_modules naar bron;
//                                                          git init -b main, commit `basis` met de HEAD van de bron als ouder
//                                                          (objecten via alternates, shallow-grens mee), refs/remotes/origin/main = HEAD
//   script(root: string, naam: string): void | Promise    package.json-script zonder pnpm; `&&`-stappen via sh -c met cwd root;
//                                                          `pnpm <naam>` als stap wordt intern uitgevoerd; PATH begint met
//                                                          <root>/node_modules/.bin; GIT_*-repovariabelen weg uit de omgeving
//                                                          van het kind; gooit/rejects bij een niet-nul exit of onbekend script
//                                                          (bericht bevat `geen script <naam>`)
//   ruimOp(pad: string, prefix: string): boolean          true = verwijderd; false = geweigerd (niets verwijderd,
//                                                          console.error `✗ check:app-init: weigert <pad> te verwijderen: niet de eigen tijdelijke map`)
// Bij import: geen proces, geen map, geen uitvoer.
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function kopieInKind(werkmap: ReturnType<typeof nieuweWerkmap>, prefix: string, env: Record<string, string> = {}) {
  const driver = path.join(werkmap.base, 'kopie.mjs');
  writeFileSync(
    driver,
    [
      `import { kopie } from ${JSON.stringify(MODULE)};`,
      'const [bron, prefix] = process.argv.slice(2);',
      'process.stdout.write(kopie(bron, prefix));',
      '',
    ].join('\n'),
  );
  return draaiNode([driver, werkmap.bron, prefix], werkmap.bron, { TMPDIR: werkmap.tmp, ...env });
}

describe('import', () => {
  test('exporteert kopie, script en ruimOp en doet bij import niets', () => {
    const werkmap = nieuweWerkmap(dirs);
    const leeg = path.join(werkmap.base, 'leeg');
    mkdirSync(leeg);
    const result = draaiNode(
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(MODULE)}); console.log(['kopie','script','ruimOp','bijSignaal'].map((n) => typeof m[n]).join());`,
      ],
      leeg,
      { TMPDIR: werkmap.tmp },
    );
    expect(result.code, result.alles).toBe(0);
    expect(result.stdout.trim()).toBe('function,function,function,function');
    expect(result.stderr).toBe('');
    expect(readdirSync(werkmap.tmp)).toEqual([]);
  });
});

describe('AC-16: gedeeld door beide checks', () => {
  const lees = (naam: string) => readFileSync(path.join(ROOT, 'scripts/kit', naam), 'utf8');

  test.each(['check-app-init.mjs', 'check-new-resource.mjs'])(
    '%s importeert kopie en script uit ./proef-kopie.mjs en definieert ze niet zelf',
    (naam) => {
      const tekst = lees(naam);
      const importRegel = /import\s*\{([^}]*)\}\s*from\s*'\.\/proef-kopie\.mjs'/.exec(tekst);
      expect(importRegel, `${naam} importeert niet uit ./proef-kopie.mjs`).not.toBeNull();
      const namen = (importRegel?.[1] ?? '').split(',').map((deel) => deel.trim().split(/\s+as\s+/)[0]);
      expect(namen).toContain('kopie');
      expect(namen).toContain('script');
      expect(tekst).not.toMatch(/function\s+(kopie|script)\b/);
      expect(tekst).not.toMatch(/(const|let)\s+(kopie|script)\s*=/);
    },
  );
});

describe('kopie', () => {
  function bronMetWijzigingen() {
    const werkmap = nieuweWerkmap(dirs);
    maakBron(werkmap, { scripts: { ok: 'true' } });
    writeFileSync(path.join(werkmap.bron, 'nieuw.txt'), 'ongetrackt');
    rmSync(path.join(werkmap.bron, 'CHANGELOG.md'));
    return werkmap;
  }

  test('maakt een map direct onder TMPDIR met het prefix, met tracked en nieuwe bestanden, zonder verwijderde', () => {
    const werkmap = bronMetWijzigingen();
    const result = kopieInKind(werkmap, 'app-init-proef-');
    expect(result.code, result.alles).toBe(0);
    const doel = result.stdout.trim();
    expect(path.dirname(doel)).toBe(realpathSync(werkmap.tmp));
    expect(overgebleven(werkmap, 'app-init-proef-')).toEqual([path.basename(doel)]);
    expect(readFileSync(path.join(doel, 'nieuw.txt'), 'utf8')).toBe('ongetrackt');
    expect(existsSync(path.join(doel, 'README.md'))).toBe(true);
    expect(existsSync(path.join(doel, 'CHANGELOG.md'))).toBe(false);
    expect(existsSync(path.join(doel, '.git'))).toBe(true);
  });

  test('node_modules is een symlink naar die van de bron; de git-stand is basis op main met origin/main erop', () => {
    const werkmap = bronMetWijzigingen();
    const doel = kopieInKind(werkmap, 'new-resource-').stdout.trim();
    expect(lstatSync(path.join(doel, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(realpathSync(path.join(doel, 'node_modules'))).toBe(realpathSync(path.join(werkmap.bron, 'node_modules')));
    expect(git(doel, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(git(doel, ['log', '-1', '--format=%s'])).toBe('basis');
    // basis staat op de HEAD van de bron (leerpunt #363): de bron heeft één commit, dus twee in totaal.
    expect(git(doel, ['rev-list', '--count', 'HEAD'])).toBe('2');
    expect(git(doel, ['rev-parse', 'origin/main'])).toBe(git(doel, ['rev-parse', 'HEAD']));
    expect(git(doel, ['status', '--porcelain'])).toBe('');
  });

  test('AC-17: GIT_DIR en GIT_INDEX_FILE naar de bron: de bron krijgt geen commit en geen gewijzigde index', () => {
    const werkmap = bronMetWijzigingen();
    const gitDir = path.join(werkmap.bron, '.git');
    const indexVoor = readFileSync(path.join(gitDir, 'index'));
    const headVoor = git(werkmap.bron, ['rev-parse', 'HEAD']);
    const refsVoor = git(werkmap.bron, ['for-each-ref']);
    const result = kopieInKind(werkmap, 'new-resource-', {
      GIT_DIR: gitDir,
      GIT_INDEX_FILE: path.join(gitDir, 'index'),
    });
    expect(result.code, result.alles).toBe(0);
    expect(readFileSync(path.join(gitDir, 'index')).equals(indexVoor)).toBe(true);
    expect(git(werkmap.bron, ['rev-parse', 'HEAD'])).toBe(headVoor);
    expect(git(werkmap.bron, ['for-each-ref'])).toBe(refsVoor);
    expect(git(werkmap.bron, ['rev-list', '--count', 'HEAD'])).toBe('1');
    // De kopie zelf heeft wél zijn eigen basiscommit.
    expect(git(result.stdout.trim(), ['log', '-1', '--format=%s'])).toBe('basis');
  });
});

describe('kopie: geschiedenis van de bron (leerpunt #363)', () => {
  // De app-init-test zoekt in de kopie de templatestand via `git log HEAD --full-history -- package.json`: dan moet de
  // geschiedenis van de bron vanaf HEAD bereikbaar zijn. `basis` krijgt de HEAD van de bron als ouder (objecten via
  // git-alternates, niets gekopieerd); de inhoud van `basis` blijft gelijk.

  /** Git zonder te gooien: een git-fout wordt `FOUT: …`, zodat de test op een assertie faalt. */
  function probeer(cwd: string, args: string[]): string {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : `FOUT: ${result.stderr.trim()}`;
  }

  /** Bron met twee commits: de tweede wijzigt de naam in package.json, zoals app:init doet. */
  function bronMetTweeCommits() {
    const werkmap = nieuweWerkmap(dirs);
    maakBron(werkmap, { scripts: { ok: 'true' } });
    const eerste = git(werkmap.bron, ['rev-parse', 'HEAD']);
    const pkgPad = path.join(werkmap.bron, 'package.json');
    writeFileSync(pkgPad, readFileSync(pkgPad, 'utf8').replace('"app-template"', '"mijn-app"'));
    git(werkmap.bron, ['commit', '-q', '-am', 'app:init']);
    return { werkmap, eerste, tweede: git(werkmap.bron, ['rev-parse', 'HEAD']) };
  }

  test('basis heeft de HEAD van de bron als ouder; de package.json-geschiedenis van de bron is bereikbaar', () => {
    const { werkmap, eerste, tweede } = bronMetTweeCommits();
    const result = kopieInKind(werkmap, 'new-resource-');
    expect(result.code, result.alles).toBe(0);
    const doel = result.stdout.trim();
    expect(git(doel, ['log', '-1', '--format=%s'])).toBe('basis');
    expect(probeer(doel, ['rev-parse', 'HEAD^'])).toBe(tweede);
    const log = probeer(doel, ['log', 'HEAD', '--full-history', '--format=%H', '--', 'package.json']).split('\n');
    expect(log).toContain(tweede);
    expect(log).toContain(eerste);
    expect(probeer(doel, ['show', `${eerste}:package.json`])).toContain('"name": "app-template"');
    // Inhoud, refs en werkmap zoals voorheen.
    expect(readFileSync(path.join(doel, 'package.json'), 'utf8')).toContain('"name": "mijn-app"');
    expect(git(doel, ['rev-parse', 'origin/main'])).toBe(git(doel, ['rev-parse', 'HEAD']));
    expect(git(doel, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
    expect(git(doel, ['status', '--porcelain'])).toBe('');
  });

  test('de objecten komen via alternates uit de bron, niet gekopieerd; de bron blijft onaangeroerd', () => {
    const { werkmap, tweede } = bronMetTweeCommits();
    const refsVoor = git(werkmap.bron, ['for-each-ref']);
    const doel = kopieInKind(werkmap, 'new-resource-').stdout.trim();
    const alternates = path.join(doel, '.git/objects/info/alternates');
    expect(existsSync(alternates), 'geen .git/objects/info/alternates in de kopie').toBe(true);
    const regels = existsSync(alternates) ? readFileSync(alternates, 'utf8').trim().split('\n') : [];
    expect(regels.map((regel) => realpathSync(regel))).toContain(realpathSync(path.join(werkmap.bron, '.git/objects')));
    expect(git(werkmap.bron, ['rev-parse', 'HEAD'])).toBe(tweede);
    expect(git(werkmap.bron, ['for-each-ref'])).toBe(refsVoor);
    expect(git(werkmap.bron, ['status', '--porcelain'])).toBe('');
  });

  test('ondiepe bron: de kopie slaagt, git log werkt en volgt dezelfde shallow-grens', () => {
    const { werkmap, tweede } = bronMetTweeCommits();
    const clone = path.join(werkmap.base, 'ondiep');
    git(werkmap.base, ['clone', '-q', '--depth', '1', `file://${werkmap.bron}`, clone]);
    expect(git(clone, ['rev-parse', '--is-shallow-repository'])).toBe('true');
    mkdirSync(path.join(clone, 'node_modules/.bin'), { recursive: true });
    writeFileSync(path.join(clone, 'node_modules/.bin/tool'), '#!/bin/sh\n');
    const result = kopieInKind({ ...werkmap, bron: clone }, 'new-resource-');
    expect(result.code, result.alles).toBe(0);
    const doel = result.stdout.trim();
    const basis = git(doel, ['rev-parse', 'HEAD']);
    expect(probeer(doel, ['log', 'HEAD', '--format=%H'])).toBe(`${basis}\n${tweede}`);
    expect(probeer(doel, ['log', 'HEAD', '--full-history', '--format=%H', '--', 'package.json'])).not.toMatch(/^FOUT/);
    expect(git(doel, ['status', '--porcelain'])).toBe('');
  });
});

describe('script', () => {
  function root(scripts: Record<string, string>, probes: Record<string, string> = {}) {
    const werkmap = nieuweWerkmap(dirs);
    const dir = path.join(werkmap.base, 'root');
    mkdirSync(path.join(dir, 'node_modules/.bin'), { recursive: true });
    mkdirSync(path.join(dir, 'probe'), { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts }));
    for (const [naam, inhoud] of Object.entries(probes)) writeFileSync(path.join(dir, 'probe', naam), inhoud);
    return { werkmap, dir };
  }

  /** Draait script(dir, naam) in een kind; exit 0 = geslaagd, 1 = gegooid of afgewezen (melding na "GEFAALD:"). */
  function loopt(setup: ReturnType<typeof root>, naam: string, env: Record<string, string> = {}) {
    const driver = path.join(setup.werkmap.base, 'script.mjs');
    writeFileSync(
      driver,
      [
        `import { script } from ${JSON.stringify(MODULE)};`,
        'try {',
        '  await script(process.argv[2], process.argv[3]);',
        '} catch (error) {',
        '  console.error("GEFAALD:" + (error instanceof Error ? error.message : String(error)));',
        '  process.exitCode = 1;',
        '}',
        '',
      ].join('\n'),
    );
    return draaiNode([driver, setup.dir, naam], setup.werkmap.base, { TMPDIR: setup.werkmap.tmp, ...env });
  }

  test('draait de regel met sh in root; && en geneste "pnpm <naam>" werken zonder pnpm', () => {
    const setup = root({ a: 'echo a >> log && pnpm b', b: 'echo b >> log && echo c >> log' });
    const result = loopt(setup, 'a');
    expect(result.code, result.alles).toBe(0);
    expect(readFileSync(path.join(setup.dir, 'log'), 'utf8')).toBe('a\nb\nc\n');
  });

  test('een niet-nul exit is een fout en stopt de latere stappen', () => {
    const setup = root({ kapot: 'false && echo nooit >> log' });
    const result = loopt(setup, 'kapot');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GEFAALD:');
    expect(existsSync(path.join(setup.dir, 'log'))).toBe(false);
  });

  test('een onbekend script is een duidelijke fout', () => {
    const result = loopt(root({}), 'bestaat-niet');
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/geen script bestaat-niet/);
  });

  test('PATH begint met <root>/node_modules/.bin en de repovariabelen van git zijn weg (git-hook)', () => {
    const setup = root(
      { sonde: 'node probe/sonde.mjs' },
      {
        'sonde.mjs': [
          "import { writeFileSync } from 'node:fs';",
          "import path from 'node:path';",
          'writeFileSync("uit.json", JSON.stringify({',
          '  eerste: (process.env.PATH ?? "").split(path.delimiter)[0],',
          '  dir: process.env.GIT_DIR ?? null,',
          '  index: process.env.GIT_INDEX_FILE ?? null,',
          '}));',
          '',
        ].join('\n'),
      },
    );
    const result = loopt(setup, 'sonde', {
      GIT_DIR: path.join(ROOT, '.git'),
      GIT_INDEX_FILE: path.join(ROOT, '.git/index'),
    });
    expect(result.code, result.alles).toBe(0);
    const uit: unknown = JSON.parse(readFileSync(path.join(setup.dir, 'uit.json'), 'utf8'));
    expect(uit).toEqual({ eerste: path.join(setup.dir, 'node_modules/.bin'), dir: null, index: null });
  });
});

describe('ruimOp', () => {
  test('AC-17: met prefix new-resource- weigert hij een pad met prefix app-init-proef- en verwijdert hij niets', () => {
    const werkmap = nieuweWerkmap(dirs);
    const pad = path.join(werkmap.tmp, 'app-init-proef-x');
    mkdirSync(pad);
    writeFileSync(path.join(pad, 'bestand'), 'x');
    const driver = path.join(werkmap.base, 'ruim.mjs');
    writeFileSync(
      driver,
      [
        `import { ruimOp } from ${JSON.stringify(MODULE)};`,
        'const [pad, prefix] = process.argv.slice(2);',
        'console.log("RESULTAAT:" + (await ruimOp(pad, prefix)));',
        '',
      ].join('\n'),
    );
    const geweigerd = draaiNode([driver, pad, 'new-resource-'], werkmap.base, { TMPDIR: werkmap.tmp });
    expect(geweigerd.stdout).toContain('RESULTAAT:false');
    // De melding noemt de check die de guard aanroept, niet altijd check:app-init.
    expect(geweigerd.alles).toContain('✗ check:new-resource: weigert');
    expect(existsSync(path.join(pad, 'bestand'))).toBe(true);
    // Met het eigen prefix gaat dezelfde map wel weg.
    const toegestaan = draaiNode([driver, pad, 'app-init-proef-'], werkmap.base, { TMPDIR: werkmap.tmp });
    expect(toegestaan.stdout).toContain('RESULTAAT:true');
    expect(existsSync(pad)).toBe(false);
  });

  test('volgt de node_modules-link niet: de bron blijft heel', () => {
    const werkmap = nieuweWerkmap(dirs);
    maakBron(werkmap, { scripts: { ok: 'true' } });
    const doel = kopieInKind(werkmap, 'new-resource-').stdout.trim();
    const driver = path.join(werkmap.base, 'ruim2.mjs');
    writeFileSync(
      driver,
      `import { ruimOp } from ${JSON.stringify(MODULE)};\nconsole.log("RESULTAAT:" + (await ruimOp(process.argv[2], "new-resource-")));\n`,
    );
    const result = draaiNode([driver, doel], werkmap.base, { TMPDIR: werkmap.tmp });
    expect(result.stdout).toContain('RESULTAAT:true');
    expect(existsSync(doel)).toBe(false);
    expect(readFileSync(path.join(werkmap.bron, 'node_modules/.bin/tool'), 'utf8')).toBe('#!/bin/sh\n');
  });
});

describe('bijSignaal', () => {
  function metSignaal(werkmap: ReturnType<typeof nieuweWerkmap>, scriptTekst: string) {
    const driver = path.join(werkmap.base, 'signaal.mjs');
    writeFileSync(
      driver,
      [`import { bijSignaal, ruimOp } from ${JSON.stringify(MODULE)};`, 'void ruimOp;', scriptTekst, ''].join('\n'),
    );
    return draaiNode([driver], werkmap.base, { TMPDIR: werkmap.tmp });
  }

  test.each([
    ['SIGTERM', 143],
    ['SIGINT', 130],
  ] as const)('een %s tijdens het synchrone kopiëren ruimt de map op en eindigt met exit %i', (signaal, code) => {
    const werkmap = nieuweWerkmap(dirs);
    const result = metSignaal(
      werkmap,
      [
        "import { mkdtempSync, writeFileSync } from 'node:fs';",
        "import { tmpdir } from 'node:os';",
        "import path from 'node:path';",
        "const s = bijSignaal('new-resource-', false);",
        `process.kill(process.pid, '${signaal}');`,
        "const doel = mkdtempSync(path.join(tmpdir(), 'new-resource-'));",
        "writeFileSync(path.join(doel, 'bestand'), 'x');",
        's.zet(doel);',
        'await new Promise((resolve) => setTimeout(resolve, 5_000));',
      ].join('\n'),
    );
    expect(result.code, result.alles).toBe(code);
    expect(overgebleven(werkmap, 'new-resource-')).toEqual([]);
  });

  test('met bewaar blijft de map staan', () => {
    const werkmap = nieuweWerkmap(dirs);
    const result = metSignaal(
      werkmap,
      [
        "import { mkdtempSync } from 'node:fs';",
        "import { tmpdir } from 'node:os';",
        "import path from 'node:path';",
        "const s = bijSignaal('new-resource-', true);",
        "s.zet(mkdtempSync(path.join(tmpdir(), 'new-resource-')));",
        "process.kill(process.pid, 'SIGTERM');",
        'await new Promise((resolve) => setTimeout(resolve, 5_000));',
      ].join('\n'),
    );
    expect(result.code, result.alles).toBe(143);
    expect(overgebleven(werkmap, 'new-resource-')).toHaveLength(1);
  });

  test('check:new-resource gebruikt hem, en een rode gate geeft een ✗-regel zonder stacktrace', () => {
    expect(readFileSync(path.join(ROOT, 'scripts/kit/check-new-resource.mjs'), 'utf8')).toMatch(
      /import \{[^}]*\bbijSignaal\b[^}]*\} from '\.\/proef-kopie\.mjs'/,
    );
    const werkmap = nieuweWerkmap(dirs);
    // Zonder scripts/kit/new-resource.mjs in de kopie faalt de eerste stap van genereer().
    maakBron(werkmap, { scripts: { ok: 'true' } });
    const result = draaiNode([path.join(ROOT, 'scripts/kit/check-new-resource.mjs')], werkmap.bron, {
      TMPDIR: werkmap.tmp,
    });
    expect(result.code, result.alles).toBe(1);
    expect(result.stderr).toContain('✗ check:new-resource:');
    // De stacktrace van het falende kindproces blijft; de check zelf eindigt met één ✗-regel, zonder eigen stacktrace.
    expect(result.stderr.trim().split('\n').at(-1)).toMatch(/^✗ check:new-resource: /);
    expect(result.stderr).not.toContain('check-new-resource.mjs');
    expect(overgebleven(werkmap, 'new-resource-')).toEqual([]);
  });
});

// check:new-resource (ADR 0047 punt 9): code uit `pnpm new:resource` haalt gate:fast. Kopieert de repo (git ls-files, ook
// nieuwe bestanden) naar een tijdelijke map met een link naar node_modules, draait daar beide fasen met een vaste naam, zet
// de gate-wijzigingen zoals de hoofdsessie dat met Edit doet, en draait gate:fast. Duurt minuten: eigen job in CI, niet in
// gate:fast. gate:slow hoort er bewust niet bij: check-policies faalt tot de tester de pgTAP-tests schrijft.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snelleGates } from './gate-fast.mjs';
import { pasToe, plan, schrijf } from './new-resource.mjs';

// Met een streepje, zodat ook de afleiding van tabel-, camel- en PascalCase-namen door gate:fast gaat.
const NAAM = 'time-entries';
const ROLLEN = ['user', 'admin'];

/** @param {string} cwd @param {string} commando @param {readonly string[]} args */
function draai(cwd, commando, args) {
  execFileSync(commando, args, { cwd, stdio: 'inherit' });
}

/**
 * Een script uit package.json, zonder pnpm: pnpm wil in de kopie (node_modules als link) eerst installeren.
 * @param {string} root
 * @param {string} naam
 */
function script(root, naam) {
  /** @type {{ scripts: Record<string, string> }} */
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const regel = pkg.scripts[naam];
  if (regel === undefined) throw new Error(`package.json: geen script ${naam}`);
  for (const stap of regel.split(' && ')) {
    if (stap.startsWith('pnpm ')) script(root, stap.slice('pnpm '.length));
    else
      execFileSync('sh', ['-c', stap], {
        cwd: root,
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: `${path.join(root, 'node_modules/.bin')}${path.delimiter}${process.env['PATH'] ?? ''}`,
        },
      });
  }
}

/** @param {string} bron @returns {string} */
function kopie(bron) {
  const doel = mkdtempSync(path.join(tmpdir(), 'new-resource-'));
  const bestanden = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: bron,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((pad) => pad !== '');
  for (const pad of bestanden) {
    mkdirSync(path.dirname(path.join(doel, pad)), { recursive: true });
    // Een verwijderd maar nog niet gecommit bestand staat wel in de index, niet op schijf.
    cpSync(path.join(bron, pad), path.join(doel, pad), { force: true, errorOnExist: false });
  }
  symlinkSync(path.join(bron, 'node_modules'), path.join(doel, 'node_modules'), 'dir');
  // check:migrations vergelijkt met origin/main: de kopie zonder de gegenereerde bestanden is die basis.
  const git = ['-c', 'user.name=check', '-c', 'user.email=check@example.test'];
  draai(doel, 'git', ['init', '-q', '-b', 'main']);
  draai(doel, 'git', ['add', '-A']);
  draai(doel, 'git', [...git, 'commit', '-q', '--no-verify', '-m', 'basis']);
  draai(doel, 'git', ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return doel;
}

/** @param {string} root */
async function genereer(root) {
  // Fase 1 via de commandoregel: het spec-skelet. De eigenaar zet hem op goedgekeurd; hier doet de check dat.
  draai(root, 'node', ['scripts/kit/new-resource.mjs', NAAM]);
  const spec = path.join(root, 'docs/specs', `${NAAM}.md`);
  // Ook OV-1 gaat op besloten, zoals de eigenaar na zijn antwoorden doet (anders weigert check-docs de goedgekeurde spec).
  const goedgekeurd = readFileSync(spec, 'utf8')
    .replace(/^status: voorstel\b/m, 'status: goedgekeurd')
    .replace('**OV-1 ⚠ open**', '**OV-1 ✅ besloten**');
  writeFileSync(spec, goedgekeurd);
  draai(root, 'node', ['scripts/kit/new-resource.mjs', NAAM, '--rollen', ROLLEN.join(','), '--dry-run']);
  // Fase 2 met het plan zelf, zodat de check de afgedrukte gate-wijzigingen kan zetten.
  const p = await plan(root, NAAM, { rollen: ROLLEN });
  await schrijf(root, p);
  for (const wijziging of p.gates) {
    const pad = path.join(root, wijziging.pad);
    writeFileSync(pad, pasToe(readFileSync(pad, 'utf8'), wijziging));
  }
}

const root = kopie(process.cwd());
try {
  await genereer(root);
  // De snelle gates uit het register na elkaar, elk zonder pnpm (zie script()); gate:fast zelf start pnpm per gate.
  for (const gate of snelleGates()) script(root, gate);
  console.log(`check:new-resource: ${NAAM} haalt gate:fast`);
} finally {
  if (!process.argv.includes('--bewaar')) rmSync(root, { recursive: true, force: true });
  else console.log(`check:new-resource: kopie bewaard in ${root}`);
}

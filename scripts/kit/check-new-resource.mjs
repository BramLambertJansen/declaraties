// check:new-resource (ADR 0047 punt 9): code uit `pnpm new:resource` haalt gate:fast. Kopieert de repo (git ls-files, ook
// nieuwe bestanden) naar een tijdelijke map met een link naar node_modules, draait daar beide fasen met een vaste naam, zet
// de gate-wijzigingen zoals de hoofdsessie dat met Edit doet, en draait gate:fast. Duurt minuten: eigen job in CI, niet in
// gate:fast. gate:slow hoort er bewust niet bij: check-policies faalt tot de tester de pgTAP-tests schrijft.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { snelleGates } from './gate-fast.mjs';
import { pasToe, plan, schrijf } from './new-resource.mjs';
import { bijSignaal, kopie, ruimOp, script, start } from './proef-kopie.mjs';

// Met een streepje, zodat ook de afleiding van tabel-, camel- en PascalCase-namen door gate:fast gaat.
const NAAM = 'time-entries';
const PREFIX = 'new-resource-';
const ROLLEN = ['user', 'admin'];

/** @param {string} cwd @param {string} commando @param {readonly string[]} args */
async function draai(cwd, commando, args) {
  if ((await start(cwd, commando, args)) !== 0) throw new Error(`${commando} ${args.join(' ')} faalde`);
}

/** @param {string} root */
async function genereer(root) {
  // Fase 1 via de commandoregel: het spec-skelet. De eigenaar zet hem op goedgekeurd; hier doet de check dat.
  await draai(root, 'node', ['scripts/kit/new-resource.mjs', NAAM]);
  const spec = path.join(root, 'docs/specs', `${NAAM}.md`);
  // Ook OV-1 gaat op besloten, zoals de eigenaar na zijn antwoorden doet (anders weigert check-docs de goedgekeurde spec).
  const goedgekeurd = readFileSync(spec, 'utf8')
    .replace(/^status: voorstel\b/m, 'status: goedgekeurd')
    .replace('**OV-1 ⚠ open**', '**OV-1 ✅ besloten**');
  writeFileSync(spec, goedgekeurd);
  await draai(root, 'node', ['scripts/kit/new-resource.mjs', NAAM, '--rollen', ROLLEN.join(','), '--dry-run']);
  // Fase 2 met het plan zelf, zodat de check de afgedrukte gate-wijzigingen kan zetten.
  const p = await plan(root, NAAM, { rollen: ROLLEN });
  await schrijf(root, p);
  for (const wijziging of p.gates) {
    const pad = path.join(root, wijziging.pad);
    writeFileSync(pad, pasToe(readFileSync(pad, 'utf8'), wijziging));
  }
}

const bewaar = process.argv.includes('--bewaar');
const signaal = bijSignaal(PREFIX, bewaar);
/** @type {string | undefined} */
let root;
try {
  root = kopie(process.cwd(), PREFIX);
  signaal.zet(root);
  await genereer(root);
  // De snelle gates uit het register na elkaar, elk zonder pnpm (zie script()); gate:fast zelf start pnpm per gate.
  for (const gate of snelleGates()) await script(root, gate);
  console.log(`check:new-resource: ${NAAM} haalt gate:fast`);
} catch (error) {
  console.error(`✗ check:new-resource: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  signaal.ontkoppel();
  if (root !== undefined && bewaar) console.log(`check:new-resource: kopie bewaard in ${root}`);
  else if (root !== undefined) ruimOp(root, PREFIX);
}

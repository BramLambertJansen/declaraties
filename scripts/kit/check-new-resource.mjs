// check:new-resource (ADR 0047 punt 9, ADR 0073): code uit `pnpm new:resource` haalt gate:fast, in de template na
// `app:init`. Eén tijdelijke kopie (draaiProef in draai-proef.mjs): in de template eerst app:init, dan beide fasen van de
// generator met een vaste naam en de gate-wijzigingen zoals de hoofdsessie dat met Edit doet, dan één keer de snelle suite.
// Een volgende generator schuift hier aan, zonder eigen job (ADR 0073 punt 4). Duurt minuten: eigen job in CI, niet in
// gate:fast. gate:slow hoort er bewust niet bij: check-policies faalt tot de tester de pgTAP-tests schrijft.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DELEN, deelUitArgs, snelleGates } from './gate-fast.mjs';
import { pasToe, plan, schrijf } from './new-resource.mjs';
import { draaiProef } from './draai-proef.mjs';
import { start } from './proef-kopie.mjs';

// Met een streepje, zodat ook de afleiding van tabel-, camel- en PascalCase-namen door gate:fast gaat.
const NAAM = 'time-entries';
const ROLLEN = ['user', 'admin'];

/** @param {string} cwd @param {string} commando @param {readonly string[]} args */
async function draai(cwd, commando, args) {
  if ((await start(cwd, commando, args)) !== 0) throw new Error(`${commando} ${args.join(' ')} faalde`);
}

/** @param {string} root */
export async function genereer(root) {
  // Fase 1 via de commandoregel: het spec-skelet. De architect zet hem op goedgekeurd, de eigenaarmerge is het besluit; hier doet de check dat.
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

if (import.meta.main) {
  // `--deel` (ADR 0076): elk deel maakt een eigen kopie met init en generator, en draait zijn deel van de suite.
  const keuze = deelUitArgs(process.argv.slice(2));
  if (keuze !== null && keuze.deel === null) {
    console.error(
      `✗ check:new-resource: onbekend deel ${keuze.naam}; kies ${DELEN.join(', ').replace(/, (?=[^,]*$)/, ' of ')}`,
    );
    process.exit(1);
  }
  process.exitCode = await draaiProef(process.cwd(), keuze?.deel?.scripts ?? snelleGates(), {
    bewaar: process.argv.includes('--bewaar'),
    genereer,
    naam: keuze === null ? 'check:new-resource' : `check:new-resource (${keuze.naam})`,
    onderwerp: NAAM,
    ...(keuze === null || keuze.deel === null ? {} : { deel: keuze.naam, args: keuze.deel.args }),
  });
}

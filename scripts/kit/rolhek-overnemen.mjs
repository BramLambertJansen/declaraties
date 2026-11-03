// `pnpm rolhek:overnemen <pad>… | --alles` (ADR 0066, spec rolhek-effect AC-5): de eigenaar neemt een wijziging over die een
// subagent buiten zijn rol maakte. De overtreding vervalt; de huidige staat van het pad telt daarna niet meer als overtreding.
// Draait buiten de sandbox (`sandbox.excludedCommands`); het rolhek vraagt de hoofdsessie altijd en weigert het een subagent.
import { entryVan } from '../../rails/hooks/lib/effect-compare.mjs';
import {
  agentOpnamen,
  leesOvergenomen,
  overtredingen,
  schrijfJson,
  opslag,
  schrijfOvergenomen,
} from '../../rails/hooks/lib/effect.mjs';
import { gitIn, momentopname } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { rolhekContext } from '../../rails/hooks/lib/rolhek-context.mjs';
import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * @param {readonly string[]} args
 * @param {import('../../rails/hooks/lib/effect.mjs').Repo} repo
 */
export function neemOver(args, repo) {
  const alles = args.length === 1 && args[0] === '--alles';
  if (!alles && (args.length === 0 || args.some((arg) => arg.startsWith('-'))))
    throw new Error('Gebruik: pnpm rolhek:overnemen <pad>… | --alles');
  const lijst = overtredingen(repo);
  const gekozen = alles ? lijst : lijst.filter((o) => o.rel !== null && args.includes(o.rel));
  const onbekend = alles ? [] : args.filter((arg) => !gekozen.some((o) => o.rel === arg));
  if (onbekend.length > 0) throw new Error(`Geen open overtreding voor: ${onbekend.join(', ')}`);
  const nu = momentopname(repo);
  const genomen = leesOvergenomen(repo);
  for (const o of gekozen) if (o.rel !== null) genomen[o.rel] = JSON.stringify(entryVan(nu, o.rel));
  schrijfOvergenomen(repo, genomen);
  // `--alles` laat ook de te grote momentopnamen van subagents (AC-7) vervallen: die gaven anders bij elke nacontrole opnieuw
  // een overtreding zonder pad. Geldige opnamen blijven staan, zodat de nacontrole van andere subagents blijft werken.
  if (alles)
    for (const { id, opname } of agentOpnamen(repo, null))
      if (opname.snap === null) rmSync(path.join(opslag(repo), 'agent', `${id}.json`), { force: true });
  schrijfJson(
    path.join(opslag(repo), 'overtredingen.json'),
    lijst.filter((o) => !gekozen.includes(o)),
  );
  return gekozen;
}

if (import.meta.main) {
  try {
    const root = process.cwd();
    const repo = { root, git: gitIn(root), ctx: rolhekContext(root, root), now: () => Date.now() };
    const gekozen = neemOver(process.argv.slice(2), repo);
    console.log(`Overgenomen: ${gekozen.map((o) => o.rel ?? '(hele werkmap)').join(', ') || 'niets'}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

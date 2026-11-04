// Tellers van de toets op effect (spec rolhek-vooraf-krimp AC-7): blokkades op effect, overnames en de schaduwbeslissing over
// de hoofdsessie, als extra regels in het meetbestand van de sessie (rails/hooks/lib/meting.mjs). Alleen uitkomsten, aantallen
// en paden, nooit inhoud (R-ROL-09). Faalt open: meten mag de toets nooit laten struikelen.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { branch, opslagmap, repoRoot } from './meting.mjs';

/**
 * @typedef {'deny' | 'ask' | 'melding' | 'door'} Uitkomst
 * @typedef {{ e: 'EffectBlokkade', n: number } |
 *   { e: 'Schaduw', id: string, vooraf: Uitkomst | 'onbekend', achteraf: Uitkomst, paden: string[] }} Teller
 */

/** @param {string} sessie */
const sessieId = (sessie) => (/^[A-Za-z0-9_-]+$/.test(sessie) ? sessie : 'onbekend');

/**
 * Eén regel in `<opslagmap>/<sessie>.jsonl`.
 * @param {{ root: string, now: () => number }} repo
 * @param {{ sessie: string, agentType: string }} wie
 * @param {Teller} teller
 */
export function meet(repo, wie, teller) {
  try {
    const map = opslagmap(repo.root, process.env);
    if (map === null) return;
    const regel = {
      t: new Date(repo.now()).toISOString(),
      s: sessieId(wie.sessie),
      b: branch(repoRoot(repo.root)),
      a: wie.agentType || 'hoofdsessie',
      ...teller,
    };
    mkdirSync(map, { recursive: true });
    appendFileSync(path.join(map, `${sessieId(wie.sessie)}.jsonl`), `${JSON.stringify(regel)}\n`);
  } catch {
    // Faalt open (R-ROL-09: meten blokkeert nooit).
  }
}

/** De strengste uitkomst van een beslissing. @param {{ deny: readonly string[], ask: readonly string[], context: readonly string[] }} besluit @returns {Uitkomst} */
export function uitkomstVan(besluit) {
  if (besluit.deny.length > 0) return 'deny';
  if (besluit.ask.length > 0) return 'ask';
  return besluit.context.length > 0 ? 'melding' : 'door';
}

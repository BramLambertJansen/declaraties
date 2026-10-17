// Meethook (ADR 0029 punt 12): observeert alleen. Leest de payload van stdin en voegt één regel toe aan
// `<git common dir>/agent-meting/<session_id>.jsonl` of `METING_DIR` (lib/meting.mjs); buiten een repo schrijft hij niets.
// Schrijft nooit naar stdout, blokkeert nooit en eindigt altijd met exit 0, ook bij een fout of een lib die niet laadt
// (fail-open; daarom de dynamische import binnen de try). Overzicht: `pnpm meting` (scripts/kit/meting.mjs).
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

try {
  const { bestand, regel } = await import('./lib/meting.mjs');
  /** @type {unknown} */
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const uit = regel(payload, new Date());
  const doel = bestand(payload, process.env);
  if (uit !== null && doel !== null) {
    mkdirSync(path.dirname(doel), { recursive: true });
    appendFileSync(doel, `${JSON.stringify(uit)}\n`);
  }
} catch {
  // Fail-open: meten mag het werk nooit hinderen.
}
process.exit(0);

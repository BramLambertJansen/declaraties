import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// SessionStart draait `werkstraat session-start` (branch, achterstand op main, open PR, anker van de hook-lader, ADR 0045 punt 3)
// voor elke bron waarmee Claude Code een sessie start. De bronnen staan in de Claude Code-docs (hooks, matcher-tabel):
// `startup`, `resume`, `clear`, `compact` en `fork` (`--fork-session`, `/fork`). Een geforkte sessie zonder deze hook start
// zonder vers anker en zonder melding over een verouderde main.
const BRONNEN = ['startup', 'resume', 'clear', 'compact', 'fork'];

function child(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

test('SessionStart-matcher van werkstraat dekt elke sessiebron van Claude Code', () => {
  const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  const entries = child(child(settings, 'hooks'), 'SessionStart');
  const lijst: unknown[] = Array.isArray(entries) ? entries : [];
  const werkstraat = lijst.find((entry) => JSON.stringify(entry).includes('werkstraat.mjs\\" session-start'));
  const matcher = child(werkstraat, 'matcher');

  expect(typeof matcher === 'string' ? matcher.split('|').sort() : null).toStrictEqual([...BRONNEN].sort());
});

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Stap 1 van .claude/agents/reviewer.md: de reviewer vraagt de feiten op (gates, specs, fase) en blijft verder read-only.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function verdict(command: string) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: 'reviewer' },
    {
      root: ROOT,
      cwd: ROOT,
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
    },
  );
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

describe('reviewer: node scripts/kit/feiten.mjs', () => {
  test.each(['node scripts/kit/feiten.mjs', 'node scripts/kit/feiten.mjs gates specs fase'])(
    '%s → allow',
    (command) => {
      expect(verdict(command)).toBe('allow');
    },
  );

  test.each([
    { name: 'een ander script', command: 'node scripts/kit/new-resource.mjs x' },
    { name: 'node -e', command: 'node -e 1' },
    { name: 'een omleiding naar een bestand', command: 'node scripts/kit/feiten.mjs fase > docs/x.md' },
    { name: 'een tweede commando', command: 'node scripts/kit/feiten.mjs fase && touch a' },
    { name: 'een node met pad', command: '/tmp/x/node scripts/kit/feiten.mjs fase' },
    { name: 'een ander pad met dezelfde naam', command: 'node /tmp/scripts/kit/feiten.mjs' },
  ])('$name → deny', ({ command }) => {
    expect(verdict(command)).toBe('deny');
  });
});

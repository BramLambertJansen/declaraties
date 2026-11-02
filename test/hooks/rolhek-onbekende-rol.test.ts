import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig, roleOf } from '../../rails/hooks/lib/rolhek.mjs';

// R-ROL-02: een onbekende subagent (ad-hoc, Explore, general-purpose) krijgt de strengste rol. Dat was de developer, met
// schrijfrecht op `**`; nu de reviewer: alleen lezen, en schrijfwerk gaat via een benoemde rol uit .claude/agents.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ONBEKEND = ['general-purpose', 'Explore', 'Plan', 'mijn-eigen-agent'];

function verdict(payload: Record<string, unknown>): 'allow' | 'ask' | 'deny' {
  const decision = decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  });
  if (decision.deny.length > 0) return 'deny';
  return decision.ask.length > 0 ? 'ask' : 'allow';
}

describe('onbekende subagent: strengste rol', () => {
  test.each(ONBEKEND)('%s telt als reviewer', (agent) => {
    expect(roleOf(agent)).toBe('reviewer');
  });

  test.each(ONBEKEND)('%s schrijft niet in src/', (agent) => {
    const edit = { tool_name: 'Write', tool_input: { file_path: `${ROOT}/src/x.ts`, content: 'x' }, agent_type: agent };
    expect(verdict(edit)).toBe('deny');
  });

  test.each(['echo x > src/x.ts', 'git commit -m x', 'rm -rf src'])(
    'Bash die schrijft wordt geweigerd: %s',
    (command) => {
      expect(
        ONBEKEND.map((agent) => verdict({ tool_name: 'Bash', tool_input: { command }, agent_type: agent })),
      ).toStrictEqual(ONBEKEND.map(() => 'deny'));
    },
  );

  test.each(['git diff', 'git log', 'pnpm test:unit'])('lezen zoals de reviewer mag: %s', (command) => {
    expect(verdict({ tool_name: 'Bash', tool_input: { command }, agent_type: 'general-purpose' })).toBe('allow');
  });

  test('de benoemde developer schrijft nog wel in src/', () => {
    const edit = {
      tool_name: 'Write',
      tool_input: { file_path: `${ROOT}/src/x.ts`, content: 'x' },
      agent_type: 'developer',
    };
    expect(verdict(edit)).toBe('allow');
  });
});

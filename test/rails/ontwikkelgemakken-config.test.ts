import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Ontwikkelgemakken 2, 5, 6 en 7: de bedrading in de echte configuratie (.claude/settings.json, lefthook.yml en de stubs).

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function settings(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  if (!isRecord(parsed)) throw new Error('.claude/settings.json is geen object');
  return parsed;
}

function commandHooks(event: string): { command: string; timeout: unknown }[] {
  const hooks = settings()['hooks'];
  const groepen = isRecord(hooks) ? hooks[event] : undefined;
  if (!Array.isArray(groepen)) return [];
  return groepen.flatMap((groep: unknown) => {
    const lijst = isRecord(groep) ? groep['hooks'] : undefined;
    if (!Array.isArray(lijst)) return [];
    return lijst.flatMap((hook: unknown) =>
      isRecord(hook) && hook['type'] === 'command' && typeof hook['command'] === 'string'
        ? [{ command: hook['command'], timeout: hook['timeout'] }]
        : [],
    );
  });
}

/** De regels van een top-level sleutel in lefthook.yml, tot de volgende top-level sleutel. */
function lefthookSectie(naam: string): string {
  const regels = readFileSync('lefthook.yml', 'utf8').split('\n');
  const start = regels.indexOf(`${naam}:`);
  if (start === -1) return '';
  const rest = regels.slice(start + 1);
  const einde = rest.findIndex((regel) => /^[^\s#]/.test(regel));
  return (einde === -1 ? rest : rest.slice(0, einde)).join('\n');
}

test('Notification-hook wijst naar de melding-stub met een korte timeout', () => {
  const melding = commandHooks('Notification').find((hook) => hook.command.includes('melding.mjs'));

  expect(melding?.command).toBe('node "$CLAUDE_PROJECT_DIR/.claude/hooks/melding.mjs"');
  expect(typeof melding?.timeout).toBe('number');
  expect(Number(melding?.timeout)).toBeLessThanOrEqual(10);
});

test('statusLine wijst naar de statusregel-stub', () => {
  expect(settings()['statusLine']).toStrictEqual({
    type: 'command',
    command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/statusregel.mjs"',
  });
});

test.each(['melding', 'statusregel'])('stub .claude/hooks/%s.mjs laadt de main-versie via laden.mjs', (naam) => {
  const stub = `.claude/hooks/${naam}.mjs`;

  expect(existsSync(stub)).toBe(true);
  const tekst = readFileSync(stub, 'utf8');
  expect(tekst).toContain("import { draai } from './laden.mjs';");
  expect(tekst).toContain(`draai('${naam}', false);`);
  expect(existsSync(`rails/hooks/${naam}.mjs`)).toBe(true);
});

test('lefthook: commit-msg controleert het bericht met het script', () => {
  expect(lefthookSectie('commit-msg')).toContain('node scripts/kit/commit-msg.mjs {1}');
});

test('lefthook: pre-push meldt de achterstand op main naast gate-fast', () => {
  const prePush = lefthookSectie('pre-push');

  expect(prePush).toContain('node scripts/kit/main-achterstand.mjs');
  expect(prePush).toContain('name: gate-fast');
  expect(prePush).toContain('run: pnpm gate:fast');
});

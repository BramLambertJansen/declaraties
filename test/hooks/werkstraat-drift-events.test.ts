import { describe, expect, test } from 'vitest';
import { postEdit, sessionStart, stop, subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

// PR 6a, AC-13: de docs-drift-herinnering komt alleen bij het Stop-event van de hoofdsessie. Bij elk ander event, ook als
// de wijziging wel drift bevat, geeft werkstraat.mjs de herinnering niet.
const DRIFT = ['src/a.ts'];

function deps(changed: readonly string[] = DRIFT) {
  return {
    run: () => ({ code: 0, output: '' }),
    changed: () => [...changed],
    read: () => null,
  };
}

function uitvoer(result: { stdout?: string; stderr?: string }): string {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

describe('docs-drift: alleen bij Stop', () => {
  test('referentie: het Stop-event herinnert aan docs-drift', () => {
    expect(uitvoer(stop({ session_id: 's1', hook_event_name: 'Stop' }, deps()))).toContain('docs-drift');
  });

  test.each(['SubagentStop', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'SessionEnd'])(
    'stop() met payload van event %s geeft geen herinnering',
    (naam) => {
      expect(uitvoer(stop({ session_id: 's1', hook_event_name: naam }, deps()))).not.toContain('docs-drift');
    },
  );

  test.each(['developer', 'tester', 'reviewer', 'architect', undefined])(
    'SubagentStop (%s) geeft geen herinnering',
    (rol) => {
      const payload = {
        session_id: 's1',
        hook_event_name: 'SubagentStop',
        ...(rol === undefined ? {} : { agent_type: rol }),
      };

      expect(uitvoer(subagentStop(payload, deps()))).not.toContain('docs-drift');
    },
  );

  test('PostToolUse (post-edit) geeft geen herinnering', () => {
    const payload = { hook_event_name: 'PostToolUse', tool_input: { file_path: '/repo/src/a.ts' } };

    expect(uitvoer(postEdit(payload, { root: '/repo', deps: deps() }))).not.toContain('docs-drift');
  });

  test('SessionStart geeft geen herinnering', () => {
    expect(uitvoer(sessionStart(deps()))).not.toContain('docs-drift');
  });
});

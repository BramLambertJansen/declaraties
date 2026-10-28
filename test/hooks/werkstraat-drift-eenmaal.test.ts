import { describe, expect, test } from 'vitest';
import { stop } from '../../rails/hooks/lib/werkstraat.mjs';

// De docs-drift-herinnering komt één keer per sessie: `deps.changed()` bevat ook gecommitte branchbestanden, dus zonder
// geheugen zou elke volgende beurt van de hoofdsessie opnieuw blokkeren.
function deps(onthouden: Set<string>) {
  return {
    run: () => ({ code: 0, output: '' }),
    changed: () => ['src/a.ts'],
    read: () => null,
    onthoud: (sleutel: string) => {
      if (onthouden.has(sleutel)) return false;
      onthouden.add(sleutel);
      return true;
    },
  };
}

function reden(result: { stdout?: string }): string {
  if (result.stdout === undefined) return '';
  const parsed: unknown = JSON.parse(result.stdout);
  return typeof parsed === 'object' && parsed !== null && 'reason' in parsed ? String(parsed.reason) : '';
}

describe('stop: docs-drift één keer per sessie', () => {
  test('eerste stop herinnert, de volgende stop in dezelfde sessie niet', () => {
    const geheugen = new Set<string>();

    expect(reden(stop({ session_id: 's1' }, deps(geheugen)))).toContain('docs-drift');
    expect(stop({ session_id: 's1' }, deps(geheugen))).toStrictEqual({});
  });

  test('een nieuwe sessie herinnert opnieuw', () => {
    const geheugen = new Set<string>(['docs-drift-s1']);

    expect(reden(stop({ session_id: 's2' }, deps(geheugen)))).toContain('docs-drift');
  });

  test('zonder sessie-id telt het als nieuw', () => {
    const geheugen = new Set<string>();
    stop({}, deps(geheugen));

    expect(reden(stop({}, deps(geheugen)))).toContain('docs-drift');
  });
});

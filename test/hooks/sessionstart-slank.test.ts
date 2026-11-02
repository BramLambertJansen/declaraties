import { describe, expect, test } from 'vitest';
import { sessionStart } from '../../rails/hooks/lib/werkstraat.mjs';

// SessionStart slank (roadmap: Vervolg compacte kennisbasis): geen specslijst, de doctor als één regel, e2e alleen bij een
// niet-geslaagde uitslag. De deps zijn nagebootst; de specslijst en de doctor-uitvoer zijn de huidige, volledige vormen.
const SPECS = Array.from({ length: 24 }, (_, i) => `docs/specs/spec-nummer-${String(i)}.md gebouwd`).join('\n');
const STACK_UIT = [
  ['Postgres', '54322'],
  ['Mailpit', '54324'],
  ['API', '8787'],
  ['Web', '5173'],
]
  .map(
    ([naam, poort]) =>
      `✗ ${String(naam)} niet bereikbaar op 127.0.0.1:${String(poort)}\n  → de eigenaar start de stack met \`pnpm dev\``,
  )
  .join('\n');
const FEITEN = 'node scripts/kit/feiten.mjs gates specs fase';

interface Opties {
  readonly branch?: string;
  readonly doctor?: string;
  readonly lastRun?: string | null;
  readonly counts?: string;
  readonly gh?: string;
  readonly changed?: readonly string[];
}

function maak(opties: Opties = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      run: (command: string, args: readonly string[]) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        if (line.startsWith('git rev-parse')) return { code: 0, output: `${opties.branch ?? 'feat/x'}\n` };
        if (line.startsWith('git rev-list')) return { code: 0, output: opties.counts ?? '0\t0' };
        if (command === 'gh') return opties.gh === undefined ? { code: 1, output: '' } : { code: 0, output: opties.gh };
        if (line.includes('feiten.mjs specs')) return { code: 0, output: SPECS };
        if (command === 'scripts/doctor.sh') return { code: 0, output: opties.doctor ?? STACK_UIT };
        return { code: 0, output: '' };
      },
      changed: () => [...(opties.changed ?? [])],
      read: (rel: string) => (rel.endsWith('.last-run.json') ? (opties.lastRun ?? null) : null),
    },
  };
}

const tekst = (opties?: Opties) => sessionStart(maak(opties).deps).stdout ?? '';

describe('sessionstart-slank AC-1: geen specslijst', () => {
  test('sessionstart-slank AC-1: de specslijst staat niet in de context', () => {
    expect(tekst()).not.toContain('spec-nummer-');
  });

  test('sessionstart-slank AC-1: feiten.mjs specs wordt niet meer aangeroepen', () => {
    const { deps, calls } = maak();
    sessionStart(deps);

    expect(calls.filter((call) => call.includes('feiten.mjs'))).toStrictEqual([]);
  });

  test('sessionstart-slank AC-1: de slotregel verwijst naar feiten.mjs gates specs fase', () => {
    expect(tekst().split('\n').at(-1)).toContain(FEITEN);
  });
});

describe('sessionstart-slank AC-2: de doctor in één regel', () => {
  test('sessionstart-slank AC-2: vier niet-bereikbare diensten worden één stack-uit-regel', () => {
    const regels = tekst().split('\n');

    expect(regels).toContain('stack uit: Postgres, Mailpit, API, Web — de eigenaar start hem met pnpm dev');
    expect(regels.filter((regel) => regel.includes('✗') || regel.includes('→'))).toStrictEqual([]);
  });

  test('sessionstart-slank AC-2: lege doctor-uitvoer geeft niets', () => {
    expect(tekst({ doctor: '' })).not.toContain('stack uit');
  });

  test('sessionstart-slank AC-2: ✓-regels (alles werkt) zijn geen waarschuwing en vallen weg, zonder stack-uit-regel', () => {
    const text = tekst({ doctor: '✓ Postgres luistert op 127.0.0.1:54322' });

    expect(text).not.toContain('stack uit');
    expect(text).not.toContain('✓');
  });

  test('sessionstart-slank AC-2: een deels draaiende stack noemt alleen de uitgevallen diensten', () => {
    const doctor =
      '✓ Postgres luistert op 127.0.0.1:54322\n✗ Web niet bereikbaar op 127.0.0.1:5173\n  → de eigenaar start de stack met `pnpm dev`';
    const text = tekst({ doctor });

    expect(text).toContain('stack uit: Web — de eigenaar start hem met pnpm dev');
    expect(text).not.toContain('Postgres');
  });

  test('sessionstart-slank AC-2: een mix van stack-✗ en een andere ✗ blijft volledig ongewijzigd, ook de →-regels', () => {
    const doctor = `${STACK_UIT}\n✗ Node-versie 20 in plaats van 26\n  → installeer Node 26`;
    const text = tekst({ doctor });

    expect(text).toContain(doctor);
    expect(text).not.toContain('stack uit:');
  });

  test('sessionstart-slank AC-3: een onleesbare uitslag meldt laatste e2e: onbekend', () => {
    expect(tekst({ lastRun: 'geen json' })).toContain('laatste e2e: onbekend');
  });

  test('sessionstart-slank AC-2: een ✗ die niet "niet bereikbaar" is, blijft ongewijzigd staan', () => {
    const doctor = '✗ Node-versie 20 in plaats van 26\n  → installeer Node 26';
    const text = tekst({ doctor });

    expect(text).toContain(doctor);
    expect(text).not.toContain('stack uit');
  });

  test('sessionstart-slank AC-2: een waarschuwing naast de stack-uit-regel blijft staan', () => {
    const text = tekst({ doctor: `${STACK_UIT}\n⚠ .env.local ontbreekt` });

    expect(text).toContain('stack uit: Postgres, Mailpit, API, Web');
    expect(text.split('\n')).toContain('⚠ .env.local ontbreekt');
  });
});

describe('sessionstart-slank AC-3: e2e alleen bij een niet-geslaagde uitslag', () => {
  test('sessionstart-slank AC-3: zonder uitslag geen e2e-regel', () => {
    expect(tekst({ lastRun: null })).not.toContain('e2e');
  });

  test('sessionstart-slank AC-3: een geslaagde uitslag blijft weg', () => {
    expect(tekst({ lastRun: '{"status": "passed", "failedTests": []}' })).not.toContain('e2e');
  });

  test('sessionstart-slank AC-3: een gefaalde uitslag wordt gemeld', () => {
    expect(tekst({ lastRun: '{"status": "failed", "failedTests": ["a"]}' }).split('\n')).toContain(
      'laatste e2e: failed',
    );
  });
});

describe('sessionstart-slank AC-4: achterstand en PR-status blijven', () => {
  test('sessionstart-slank AC-4: een achterstand eindigt met de hint git merge origin/main', () => {
    const regel = tekst({ counts: '7\t1' })
      .split('\n')
      .find((r) => r.includes('achter op origin/main'));

    expect(regel).toContain('7 commits achter op origin/main');
    expect(regel).toContain('git merge origin/main');
  });

  test('sessionstart-slank AC-4: een gemerged PR meldt de verse origin/main', () => {
    const gh = JSON.stringify({
      number: 9,
      state: 'MERGED',
      isDraft: false,
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    });

    expect(tekst({ gh })).toContain('verse origin/main');
  });

  test('sessionstart-slank AC-4: een PR met een rode check blijft zichtbaar', () => {
    const gh = JSON.stringify({
      number: 9,
      state: 'OPEN',
      isDraft: false,
      reviewDecision: '',
      statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' }],
    });

    expect(tekst({ gh })).toContain('PR #9 (open): checks 0 groen, 1 rood (lint), 0 bezig');
  });
});

describe('sessionstart-slank AC-5: korte uitvoer', () => {
  test('sessionstart-slank AC-5: schone branch zonder PR en wijzigingen met stack uit is korter dan 700 bytes', () => {
    const bytes = Buffer.byteLength(tekst(), 'utf8');

    expect(bytes).toBeLessThan(700);
  });
});

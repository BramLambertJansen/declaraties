import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// PR 6a, AC-11 en AC-12 (compacte-kennisbasis-rails): een schrijf- of verwijderactie via find, awk, sort, een redirect of een
// map geeft dezelfde uitslag als dezelfde actie op het bestaande testbestand zelf. Verwijderen is deny (`rm f`); een
// schrijfactie met onbekende inhoud krijgt de uitslag van `echo x > f` (nu: melding, nooit allow).
const ROOT = '/repo';
const DOEL = 'src/api/routes/a.test.ts';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const FILES: Record<string, string> = {
  [DOEL]: "test('a', () => {});\n",
  'test/x.test.ts': "test('x', () => {});\n",
  'src/web/routeTree.gen.ts': 'export {};\n',
  '-x.test.ts': "test('x', () => {});\n",
};
const DIRS = new Set(['test', 'src', 'src/api', 'src/api/routes']);

const ctx = {
  root: ROOT,
  cwd: ROOT,
  config,
  read: (rel: string) => FILES[rel] ?? null,
  committed: (rel: string) => rel in FILES,
  isDir: (rel: string) => DIRS.has(rel),
  // De bestanden onder een map (repo-relatief; '' is de hele repo): zo ziet het rolhek welke bestaande tests een map dekt.
  files: (rel: string) => Object.keys(FILES).filter((file) => rel === '' || file === rel || file.startsWith(`${rel}/`)),
  branch: 'feat/x',
};

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function verdict(command: string, agent?: string): Verdict {
  const d = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    ctx,
  );
  if (d.deny.length > 0) return 'deny';
  if (d.ask.length > 0) return 'ask';
  return d.context.length > 0 ? 'context' : 'allow';
}

const SUBAGENTS = ['developer', 'tester'];
const f = DOEL;
const SCHRIJF_REFERENTIE = `echo x > ${f}`;

describe('referentie: een directe actie op het testbestand', () => {
  test.each(SUBAGENTS)('%s: rm is deny, een schrijfactie is minstens een melding', (agent) => {
    expect(verdict(`rm ${f}`, agent)).toBe('deny');
    expect(verdict(SCHRIJF_REFERENTIE, agent)).not.toBe('allow');
  });
});

// Het commando wist het testbestand of de map eronder.
const VERWIJDERT: readonly string[] = [
  `find ${f} -delete`,
  'find test -name x.test.ts -delete',
  'find . -delete',
  'rm -r test',
  'rm -rf test',
  'mv test x',
];

// Het commando schrijft naar het testbestand of de map; de inhoud is voor het rolhek onbekend.
const SCHRIJFT: readonly string[] = [
  `find ${f} -fprint ${f}`,
  `find ${f} -fprint0 ${f}`,
  `find ${f} -fprintf ${f} x`,
  `find ${f} -fls ${f}`,
  `find /dev/null -fprint ${f}`,
  `find /dev/null -fprint0 ${f}`,
  `find /dev/null -fprintf ${f} x`,
  `find /dev/null -fls ${f}`,
  `awk '{print > "${f}"}' /dev/null`,
  `awk '{print >> "${f}"}' /dev/null`,
  `awk -i inplace '{}' ${f}`,
  `sort -o ${f} ${f}`,
  `sort -o ${f} /dev/null`,
  `sort -o${f} /dev/null`,
  `echo x >${f}`,
  `echo x >>${f}`,
  `echo x >|${f}`,
  `echo x >&${f}`,
  `echo x &>${f}`,
  `echo x &>>${f}`,
  `echo x 2>${f}`,
  `echo x 3<>${f}`,
  'cp -r x test',
];

describe('AC-11: verwijderen via find of een map is deny, net als rm op het bestand', () => {
  test.each(VERWIJDERT)('developer: %s', (command) => {
    expect(verdict(command, 'developer')).toBe('deny');
  });
  test.each(VERWIJDERT)('tester: %s', (command) => {
    expect(verdict(command, 'tester')).toBe('deny');
  });
});

describe('AC-11: schrijven via find, awk, sort, een redirect of een map is niet vrij', () => {
  test.each(SCHRIJFT)('developer: %s geeft dezelfde uitslag als een directe redirect', (command) => {
    expect(verdict(command, 'developer')).toBe(verdict(SCHRIJF_REFERENTIE, 'developer'));
  });
  test.each(SCHRIJFT)('tester: %s geeft dezelfde uitslag als een directe redirect', (command) => {
    expect(verdict(command, 'tester')).toBe(verdict(SCHRIJF_REFERENTIE, 'tester'));
  });
});

describe('AC-11: fd-duplicatie blijft toegestaan', () => {
  test.each(['echo x >&2', 'echo x 2>&1', 'echo x >&-', 'pnpm lint 2>&1', 'pnpm lint >&2'])(
    'developer: %s is allow',
    (command) => {
      expect(verdict(command, 'developer')).toBe('allow');
    },
  );
});

describe('B2: een pad buiten de repo-root dat de repo omvat (cwd is de root)', () => {
  test.each(['rm -rf ..', 'find .. -delete', 'find / -delete', 'rm -rf /'])('developer: %s is deny', (command) => {
    expect(verdict(command, 'developer')).toBe('deny');
  });
});

describe('I2: git checkout en git restore van tests geven dezelfde uitslag als een directe schrijfactie', () => {
  test.each(['git checkout HEAD -- test', 'git restore -s HEAD test'])('developer: %s', (command) => {
    expect(verdict(command, 'developer')).not.toBe('allow');
    expect(verdict(command, 'developer')).toBe(verdict(SCHRIJF_REFERENTIE, 'developer'));
  });
});

describe('I3: awk -i inplace met een programmabestand', () => {
  test.each(['awk -i inplace -fprog.awk', 'awk -fprog.awk -i inplace'])('developer: %s <testbestand>', (begin) => {
    expect(verdict(`${begin} ${f}`, 'developer')).toBe(verdict(SCHRIJF_REFERENTIE, 'developer'));
  });
});

describe('K4: varianten geven dezelfde uitslag als de directe referentie', () => {
  test.each(['find -H test -delete', 'find -D tree test -delete', 'find -O3 test -delete'])(
    'developer: %s is deny',
    (command) => {
      expect(verdict(command, 'developer')).toBe('deny');
    },
  );
  test.each([
    `sort --output=${f} /dev/null`,
    `sort --o ${f} /dev/null`,
    `sort -ro ${f} /dev/null`,
    `awk -iinplace '{}' ${f}`,
    `awk --include=inplace '{}' ${f}`,
    'cp -a x test',
    'cp -R x test',
    'cp --recursive x test',
  ])('developer: %s', (command) => {
    expect(verdict(command, 'developer')).toBe(verdict(SCHRIJF_REFERENTIE, 'developer'));
  });
  test.each(['rm -r test', 'find test -delete'])('hoofdsessie: %s is geen allow', (command) => {
    expect(verdict(command)).not.toBe('allow');
  });
});

describe('git restore --staged raakt de werkmap niet', () => {
  test.each(['git restore --staged .', 'git restore --staged src', 'git restore -S .'])(
    'hoofdsessie en developer: %s is geen deny',
    (command) => {
      expect([verdict(command), verdict(command, 'developer')]).not.toContain('deny');
    },
  );
  test.each(['git restore --staged --worktree .', 'git restore -SW .'])(
    'hoofdsessie: %s is deny (gegenereerd bestand onder de map)',
    (command) => {
      expect(verdict(command)).toBe('deny');
    },
  );
  test.each(['git restore --staged --work test', 'git restore -sStable test'])(
    'developer en hoofdsessie: %s geeft dezelfde uitslag als git restore test, nooit allow',
    (command) => {
      for (const rol of [undefined, 'developer']) {
        expect(verdict(command, rol)).not.toBe('allow');
        expect(verdict(command, rol)).toBe(verdict('git restore test', rol));
      }
    },
  );
  test.each(['git restore --staged --wor .', 'git restore -sSW .'])(
    'hoofdsessie: %s is deny (de map-regel geldt)',
    (command) => {
      expect(verdict(command)).toBe('deny');
    },
  );
  test('na -- is een pad dat op een optie lijkt een pad: -Sx test geeft dezelfde uitslag als test, nooit allow', () => {
    for (const rol of [undefined, 'developer']) {
      expect(verdict('git restore -- -Sx test', rol)).not.toBe('allow');
      expect(verdict('git restore -- -Sx test', rol)).toBe(verdict('git restore test', rol));
    }
  });
  test('git restore -- -Sx . is deny voor de hoofdsessie (map-regel)', () => {
    expect(verdict('git restore -- -Sx .')).toBe('deny');
  });
  test('git restore --staged -- -Wx . blijft geen deny (-Wx is een pad, geen -W)', () => {
    expect([
      verdict('git restore --staged -- -Wx .'),
      verdict('git restore --staged -- -Wx .', 'developer'),
    ]).not.toContain('deny');
  });
  test('een pad dat met - begint is na -- een schrijfdoel: -x.test.ts als bestaande test', () => {
    const referentie = verdict('git restore ./-x.test.ts', 'developer');

    expect(referentie).not.toBe('allow');
    expect(verdict('git restore -- -x.test.ts', 'developer')).toBe(referentie);
  });
  test('git restore --stag . is een afkorting van --staged en blijft geen deny', () => {
    expect([verdict('git restore --stag .'), verdict('git restore --stag .', 'developer')]).not.toContain('deny');
  });
  test.each(['git checkout -- .', 'git restore .'])(
    'geaccepteerde valse positief (R-ROL-11): %s is deny voor de hoofdsessie',
    (command) => {
      expect(verdict(command)).toBe('deny');
    },
  );
});

describe('bewust geaccepteerd', () => {
  test('geaccepteerde valse positief (R-ROL-11): find . -name x.tmp -delete is deny voor de developer', () => {
    expect(verdict('find . -name x.tmp -delete', 'developer')).toBe('deny');
  });
});

describe('AC-12: bestaande weigeringen blijven (regressie)', () => {
  test.each(SUBAGENTS)('%s: rm en mv van het testbestand zijn deny', (agent) => {
    for (const command of [`rm -f ${f}`, `mv ${f} /tmp/x`])
      expect([command, verdict(command, agent)]).toStrictEqual([command, 'deny']);
  });
  test.each(SUBAGENTS)('%s: een Write die testgevallen weghaalt is deny', (agent) => {
    const d = decide(
      { tool_name: 'Write', tool_input: { file_path: `${ROOT}/${DOEL}`, content: 'x' }, agent_type: agent },
      ctx,
    );
    expect(d.deny.length).toBeGreaterThan(0);
  });
  test('de tester kan een map met bestaande tests niet wissen', () => {
    expect(verdict('rm -rf test', 'tester')).toBe('deny');
    expect(verdict('rm -rf src', 'tester')).toBe('deny');
  });
  test('leesacties en schrijven buiten de repo blijven toegestaan', () => {
    for (const command of [`cat ${f}`, `grep a ${f}`, 'find . -name x', 'pnpm lint', 'echo x > /tmp/uit.txt'])
      expect([command, verdict(command, 'developer')]).toStrictEqual([command, 'allow']);
  });
  test('een nieuw testbestand schrijven blijft vrij voor de tester', () => {
    expect(verdict('echo x > src/api/routes/nieuw.test.ts', 'tester')).toBe('allow');
  });
});

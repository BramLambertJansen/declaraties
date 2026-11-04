import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// scripts/github-ruleset.sh (docs/nieuwe-app.md, fase 6.2): de ruleset `main` voor een app-repo, met `gh` als stub.
// De stub logt elke aanroep en bewaart de payload; er gaat niets naar GitHub.
const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/github-ruleset.sh');
const WORKFLOWS = path.join(ROOT, '.github/workflows');
// Geen verplichte check tot de GitHub App er is (ADR 0045, guard.yml). `check-core` (ADR 0040 punt 17) is wel verplicht in de
// app-ruleset. GEWIJZIGD (spec-en-bouw/AC-12, ADR 0062): `document-status` staat voortaan in de ruleset.
// `agent-merge` (ADR 0069): verplicht zou hij elke kritieke PR ook voor de eigenaar blokkeren.
// GEWIJZIGD (ADR 0073, bouw-PR 2): de job `check:app-init` bestaat niet meer, dus ook niet in deze lijst.
const NIET_VERPLICHT = ['diff-guard', 'agent-merge'];
// De matrixdelen van een verplichte check met een samenvattende job zijn bewust geen verplichte check; de samenvattende job
// is dat wel. GEWIJZIGD (ADR 0076, ci-in-delen/AC-8): niet meer alleen gate:slow, ook gate:fast en check:new-resource.
// Exact deze namen: een andere nieuwe matrixnaam blijft letterlijk staan en laat de test falen.
const DEELNAMEN = [
  'gate:fast (${{ matrix.deel }})',
  'gate:slow (${{ matrix.deel }})',
  'check:new-resource (${{ matrix.deel }})',
];
const GITHUB_ACTIONS = 15368;
const OPDRACHT = [
  'gate:fast',
  'gate:slow',
  'secrets',
  'image',
  'check:new-resource',
  'check-core',
  'document-status',
  'codeql (actions)',
  'codeql (javascript-typescript)',
  'osv-scanner',
];
const CODEQL = ['codeql (actions)', 'codeql (javascript-typescript)'];
const REGELS = ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'];
const dirs: string[] = [];

type Uitvoer = { status: number | null; stdout: string; stderr: string; aanroepen: string[]; payload: unknown };

// gh-stub. GH_MODE: leeg (geen ruleset `main`), bestaat (ruleset 42 bestaat), upgrade (private repo zonder Pro/Team).
const GH = `
echo "gh $*" >> "$STUB_DIR/log"
if [[ "$GH_MODE" == upgrade ]]; then
  echo 'gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)' >&2
  exit 1
fi
if [[ " $* " == *" --input - "* ]]; then cat > "$STUB_DIR/payload.json"; echo '{"id":42}'; exit 0; fi
if [[ "$GH_MODE" == bestaat ]]; then echo 42; fi
`;

function run(args: string[], mode = ''): Uitvoer {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-ruleset-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash\n${GH}`);
  chmodSync(path.join(dir, 'gh'), 0o755);
  writeFileSync(path.join(dir, 'log'), '');
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir, GH_MODE: mode },
  });
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(path.join(dir, 'payload.json'), 'utf8'));
  } catch {
    payload = null;
  }
  const aanroepen = readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, aanroepen, payload };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Job-namen zoals ze op een PR verschijnen: `name:` op jobniveau, met de matrix van codeql uitgeschreven.
function checksUitWorkflows(): string[] {
  const names: string[] = [];
  for (const file of readdirSync(WORKFLOWS)) {
    if (!file.endsWith('.yml')) continue;
    const source = readFileSync(path.join(WORKFLOWS, file), 'utf8');
    const matrix = /language: \[([^\]]+)\]/.exec(source)?.[1] ?? '';
    const languages = matrix === '' ? [] : matrix.split(', ');
    for (const [, name = ''] of source.matchAll(/^ {4}name: (.+)$/gm)) {
      if (DEELNAMEN.includes(name)) continue;
      if (!name.includes('${{ matrix.language }}')) {
        names.push(name);
        continue;
      }
      for (const language of languages) names.push(name.replace('${{ matrix.language }}', language));
    }
  }
  return names.filter((name) => !NIET_VERPLICHT.includes(name)).toSorted();
}

type Check = { context: string; integration_id: number };
type Regel = { type: string; parameters?: Record<string, unknown> };

function isRegel(value: unknown): value is Regel {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function isCheck(value: unknown): value is Check {
  return typeof value === 'object' && value !== null && 'context' in value;
}

function regels(payload: unknown): Regel[] {
  if (typeof payload !== 'object' || payload === null || !('rules' in payload) || !Array.isArray(payload.rules)) {
    throw new Error('payload zonder rules');
  }
  return payload.rules.filter(isRegel);
}

function checks(payload: unknown): Check[] {
  const regel = regels(payload).find((kandidaat) => kandidaat.type === 'required_status_checks');
  const lijst = regel?.parameters?.['required_status_checks'];
  if (!Array.isArray(lijst)) return [];
  return lijst.filter(isCheck);
}

// Wat de payload mist ten opzichte van de verwachte checks (leeg = compleet, alle van GitHub Actions).
function ontbrekend(payload: unknown, verwacht: string[]): string[] {
  const vanActions = checks(payload).filter((check) => check.integration_id === GITHUB_ACTIONS);
  const aanwezig = new Set(vanActions.map((check) => check.context));
  return verwacht.filter((name) => !aanwezig.has(name));
}

describe('checknamen', () => {
  test('de workflows leveren precies de checks uit de opdracht', () => {
    expect(checksUitWorkflows()).toStrictEqual(OPDRACHT.toSorted());
  });

  test('het setup-playbook noemt precies de verplichte checks uit de rulesetpayload', () => {
    const { status, payload } = run(['eigenaar/app']);
    const playbook = readFileSync(path.join(ROOT, 'docs/nieuwe-app.md'), 'utf8');
    const rulesetSection = playbook.split('**Ruleset op `main` (overdracht).**')[1]?.split('\n\n')[0] ?? '';
    const list = /\((`[^`]+`(?:,\s*`[^`]+`)*), alle van GitHub Actions\)/.exec(rulesetSection)?.[1] ?? '';
    const documented = [...list.matchAll(/`([^`]+)`/g)].map(([, name = '']) => name);

    expect(status).toBe(0);
    expect(documented.toSorted()).toStrictEqual(
      checks(payload)
        .map((check) => check.context)
        .toSorted(),
    );
  });

  test('spec-en-bouw/AC-12 de ruleset eist document-status van GitHub Actions, gelijk met de workflows', () => {
    const { status, payload } = run(['eigenaar/app']);

    expect(status).toBe(0);
    expect(checksUitWorkflows()).toContain('document-status');
    expect(checks(payload)).toContainEqual({ context: 'document-status', integration_id: GITHUB_ACTIONS });
    expect(ontbrekend(payload, checksUitWorkflows())).toStrictEqual([]);
  });

  test('de controle vangt een payload met een ontbrekende check', () => {
    const { payload } = run(['eigenaar/app']);
    const zonderOsv = checks(payload).filter((check) => check.context !== 'osv-scanner');
    const kapot = { rules: [{ type: 'required_status_checks', parameters: { required_status_checks: zonderOsv } }] };

    expect(ontbrekend(kapot, checksUitWorkflows())).toStrictEqual(['osv-scanner']);
  });
});

// ADR 0068 punt 1: `requiredChecks` in .claude/decisions.json is de enige lijst; ruleset en workflows volgen hem.
function requiredChecks(): string[] {
  const register: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/decisions.json'), 'utf8'));
  const lijst =
    typeof register === 'object' && register !== null && 'requiredChecks' in register ? register.requiredChecks : [];
  return Array.isArray(lijst) ? lijst.map(String) : [];
}

describe('samenhang-checks-rollen/AC-1: requiredChecks is de enige lijst', () => {
  test('samenhang-checks-rollen/AC-1 requiredChecks bevat check-core', () => {
    expect(requiredChecks()).toContain('check-core');
  });

  test('samenhang-checks-rollen/AC-1 de ruleset zet precies requiredChecks', () => {
    const { status, payload } = run(['eigenaar/app']);
    expect(status).toBe(0);
    expect(
      checks(payload)
        .map((check) => check.context)
        .toSorted(),
    ).toStrictEqual(requiredChecks().toSorted());
  });

  test('samenhang-checks-rollen/AC-1 met --zonder-codeql precies requiredChecks zonder CodeQL', () => {
    const { payload } = run(['eigenaar/app', '--zonder-codeql']);
    expect(
      checks(payload)
        .map((check) => check.context)
        .toSorted(),
    ).toStrictEqual(
      requiredChecks()
        .filter((naam) => !CODEQL.includes(naam))
        .toSorted(),
    );
  });

  test('samenhang-checks-rollen/AC-1 elke workflowjob staat in requiredChecks of is bewust niet verplicht, en omgekeerd', () => {
    expect(checksUitWorkflows()).toStrictEqual(requiredChecks().toSorted());
  });

  test('ci-in-delen/AC-8 elk matrixdeel hoort bij een verplichte check met een samenvattende job', () => {
    const ci = readFileSync(path.join(WORKFLOWS, 'ci.yml'), 'utf8');
    for (const deel of DEELNAMEN) {
      const check = deel.slice(0, deel.indexOf(' ('));
      expect(requiredChecks()).toContain(check);
      expect(ci).toContain(`    name: ${deel}\n`);
      expect(ci).toContain(`    name: ${check}\n`);
    }
  });

  test('samenhang-checks-rollen/AC-1 R-CI-01 en dod.md verwijzen naar requiredChecks in plaats van op te sommen', () => {
    const regel =
      readFileSync(path.join(ROOT, 'docs/framework.md'), 'utf8')
        .split('\n')
        .find((r) => r.startsWith('- **R-CI-01**')) ?? '';
    const dod =
      readFileSync(path.join(ROOT, 'docs/dod.md'), 'utf8')
        .split('\n')
        .find((r) => r.includes('Vereiste checks')) ?? '';
    for (const tekst of [regel, dod]) {
      expect(tekst).toContain('requiredChecks');
      expect(tekst).toContain('.claude/decisions.json');
      expect(tekst).not.toMatch(/Vereiste checks:\s*`gate:fast`|R-CI-01: `gate:fast`/);
    }
  });
});

describe('scripts/github-ruleset.sh', () => {
  test('nieuwe ruleset: POST met de regels uit framework §10 en alle checks van GitHub Actions', () => {
    const { status, aanroepen, payload } = run(['eigenaar/app']);
    const pullRequest = regels(payload).find((regel) => regel.type === 'pull_request');

    expect(status).toBe(0);
    expect(aanroepen.at(-1)).toBe('gh api -X POST repos/eigenaar/app/rulesets --input -');
    expect(ontbrekend(payload, checksUitWorkflows())).toStrictEqual([]);
    expect(checks(payload)).toHaveLength(checksUitWorkflows().length);
    expect(payload).toMatchObject({
      name: 'main',
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    });
    expect(regels(payload).map((regel) => regel.type)).toStrictEqual(REGELS);
    expect(pullRequest?.parameters).toMatchObject({
      required_approving_review_count: 0,
      required_review_thread_resolution: true,
      allowed_merge_methods: ['merge', 'squash'],
    });
  });

  test('bestaande ruleset `main`: PUT op hetzelfde id (opnieuw draaien is veilig)', () => {
    const { status, aanroepen } = run(['eigenaar/app'], 'bestaat');

    expect(status).toBe(0);
    expect(aanroepen.at(-1)).toBe('gh api -X PUT repos/eigenaar/app/rulesets/42 --input -');
  });

  test('--zonder-codeql: alleen de twee CodeQL-checks vallen weg', () => {
    const { status, payload, stderr } = run(['eigenaar/app', '--zonder-codeql']);

    expect(status).toBe(0);
    expect(ontbrekend(payload, checksUitWorkflows())).toStrictEqual(CODEQL);
    expect(checks(payload)).toHaveLength(checksUitWorkflows().length - CODEQL.length);
    expect(stderr).toContain('niet codeql.yml of de verplichte checks van pr:verify');
    expect(stderr).toContain('rond de setup niet af');
  });

  test('private repo zonder Pro/Team: duidelijke melding, geen zichtbaarheid gewijzigd', () => {
    const { status, stderr, aanroepen } = run(['eigenaar/app'], 'upgrade');

    expect(status).not.toBe(0);
    expect(stderr).toContain('GitHub Pro');
    expect(stderr).toContain('zichtbaarheid');
    expect(aanroepen.some((regel) => /visibility|repo edit/.test(regel))).toBe(false);
  });

  test('zonder of met een ongeldige repo: gebruiksmelding, geen aanroep van gh', () => {
    for (const args of [[], ['geen-slash'], ['eigenaar/app', '--onbekend']]) {
      const { status, stderr, aanroepen } = run(args);

      expect([status, stderr.includes('Gebruik:'), aanroepen]).toStrictEqual([2, true, []]);
    }
  });
});

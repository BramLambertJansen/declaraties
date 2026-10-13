import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { canRecordBuilt, checkedCommit } from '../../.claude/hooks/lib/built-evidence.mjs';
import { parseCheckRun, parsePullRequest } from '../../scripts/kit/github-evidence.mjs';

type BuiltEvidence = Parameters<typeof canRecordBuilt>[1];
type Authority = Parameters<typeof canRecordBuilt>[2];
type CheckRun = BuiltEvidence['checks'][number];
type PullRequest = BuiltEvidence['pr'];

// Autoritatieve feiten als invoer voor pure validators; deze tests vervangen geen GitHub- of applicatiecontrole.
const SPEC = 'docs/specs/built-evidence.md';
const REPOSITORY = 'BramLambertJansen/template';
const BRANCH = 'feat/built-evidence';
const VALIDATED_SHA = 'a'.repeat(40);
const CURRENT_SHA = 'b'.repeat(40);
const APPROVED = '---\nstatus: goedgekeurd\nnamespace: built-evidence\n---\n\n# Taak\n\nAfgebakende implementatie.\n';
const BUILT = APPROVED.replace('status: goedgekeurd', `status: gebouwd # #123; gevalideerd: ${VALIDATED_SHA}`);
const DIGEST = createHash('sha256').update(APPROVED.replace('status: goedgekeurd\n', '')).digest('hex');
const REQUIRED = { names: ['gate:fast', 'gate:slow'], sha: VALIDATED_SHA };

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 101,
    name: 'gate:fast',
    headSha: VALIDATED_SHA,
    status: 'completed',
    conclusion: 'success',
    appId: 15368,
    ...overrides,
  };
}

function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 123,
    repository: REPOSITORY,
    branch: BRANCH,
    headSha: CURRENT_SHA,
    state: 'open',
    merged: false,
    ...overrides,
  };
}

function evidence(overrides: Partial<BuiltEvidence> = {}): BuiltEvidence {
  return {
    pr: pullRequest(),
    checks: [check(), check({ id: 102, name: 'gate:slow' })],
    headSha: CURRENT_SHA,
    ancestor: true,
    onlyStatuses: true,
    ...overrides,
  };
}

function authority(overrides: Partial<Authority> = {}): Authority {
  return {
    registry: {
      version: 1,
      requiredChecks: ['gate:fast', 'gate:slow'],
      decisions: [
        { file: SPEC, digest: DIGEST, repository: REPOSITORY, branch: BRANCH, status: 'goedgekeurd', paths: [] },
      ],
    },
    repository: REPOSITORY,
    branch: BRANCH,
    trusted: (file) => (file === SPEC ? APPROVED : null),
    working: (file) => (file === SPEC ? BUILT : null),
    safe: () => true,
    ...overrides,
  };
}

function rawPullRequest(overrides: Record<string, unknown> = {}) {
  return {
    number: 123,
    base: { repo: { full_name: REPOSITORY } },
    head: { repo: { full_name: REPOSITORY }, ref: BRANCH, sha: CURRENT_SHA },
    state: 'open',
    merged: false,
    ...overrides,
  };
}

function rawCheckRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    name: 'gate:fast',
    head_sha: VALIDATED_SHA,
    status: 'completed',
    conclusion: 'success',
    app: { id: 15368 },
    ...overrides,
  };
}

function withoutKey(value: object, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

describe('checkedCommit: laatste verplichte GitHub Actions-checks op exact de gevalideerde SHA', () => {
  test('alle verplichte checks op dezelfde gevalideerde commit geven bewijs', () => {
    expect(checkedCommit(evidence().checks, REQUIRED)).toBe(true);
  });

  test('een aanvullende niet-verplichte check verandert het bewijs niet', () => {
    const checks = [...evidence().checks, check({ id: 500, name: 'extra-check', conclusion: 'failure', appId: 1 })];

    expect(checkedCommit(checks, REQUIRED)).toBe(true);
  });

  test('de nieuwste run op de juiste SHA kan een oudere rode run herstellen', () => {
    const checks = [check({ id: 99, conclusion: 'failure' }), ...evidence().checks];

    expect(checkedCommit(checks, REQUIRED)).toBe(true);
  });

  test.each([
    { name: 'nieuwere failure', latest: { id: 200, conclusion: 'failure' } },
    { name: 'nieuwere lopende run', latest: { id: 200, status: 'in_progress', conclusion: null } },
    { name: 'nieuwere queued run', latest: { id: 200, status: 'queued', conclusion: null } },
    { name: 'nieuwere geannuleerde run', latest: { id: 200, conclusion: 'cancelled' } },
  ])('$name trekt eerder groen bewijs in, ongeacht lijstvolgorde', ({ latest }) => {
    const newest = check(latest);
    const older = evidence().checks;

    expect(checkedCommit([...older, newest], REQUIRED)).toBe(false);
    expect(checkedCommit([newest, ...older], REQUIRED)).toBe(false);
  });

  test.each([
    { name: 'lege checklijst', checks: [] },
    { name: 'slow ontbreekt', checks: [check()] },
    { name: 'alleen gelijkende naam', checks: [check({ name: 'gate:fast-extra' }), check({ name: 'gate:slow' })] },
    {
      name: 'checks van actuele statuscommit',
      checks: evidence().checks.map((item) => ({ ...item, headSha: CURRENT_SHA })),
    },
    { name: 'slow op andere SHA', checks: [check(), check({ name: 'gate:slow', headSha: CURRENT_SHA })] },
    { name: 'fast niet afgerond', checks: [check({ status: 'in_progress' }), check({ name: 'gate:slow' })] },
    { name: 'fast zonder uitslag', checks: [check({ conclusion: null }), check({ name: 'gate:slow' })] },
    { name: 'fast skipped', checks: [check({ conclusion: 'skipped' }), check({ name: 'gate:slow' })] },
    { name: 'fast neutral', checks: [check({ conclusion: 'neutral' }), check({ name: 'gate:slow' })] },
    { name: 'vervalste gelijknamige app', checks: [check({ appId: 1 }), check({ name: 'gate:slow' })] },
  ])('$name levert geen bewijs', ({ checks }) => {
    expect(checkedCommit(checks, REQUIRED)).toBe(false);
  });

  test('een vervalste gelijknamige run wordt ook naast een echte groene run geweigerd', () => {
    const forged = check({ id: 50, appId: 1 });

    expect(checkedCommit([forged, ...evidence().checks], REQUIRED)).toBe(false);
    expect(checkedCommit([...evidence().checks, forged], REQUIRED)).toBe(false);
  });

  test('een latere run op een andere commit vervangt het bewijs van de gekozen commit niet', () => {
    const otherCommit = check({ id: 500, headSha: CURRENT_SHA, conclusion: 'failure' });

    expect(checkedCommit([...evidence().checks, otherCommit], REQUIRED)).toBe(true);
  });

  test.each(['', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40)])(
    'ongeldige gevalideerde SHA %s geeft geen bewijs',
    (sha) => {
      expect(checkedCommit(evidence().checks, { names: REQUIRED.names, sha })).toBe(false);
    },
  );

  test('een lege lijst verplichte checks kan geen groene validatie opleveren', () => {
    expect(checkedCommit(evidence().checks, { names: [], sha: VALIDATED_SHA })).toBe(false);
  });
});

describe('canRecordBuilt: bestaand akkoord, PR en gevalideerde implementatie samen', () => {
  test('een open PR met uitsluitend statuswijzigingen na de groene implementatiecommit is geldig', () => {
    expect(CURRENT_SHA).not.toBe(VALIDATED_SHA);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, evidence(), authority())).toBe(true);
  });

  test('ook de groene implementatiecommit zelf kan als PR-head worden aangeboden', () => {
    const validatedHead = evidence({ headSha: VALIDATED_SHA, pr: pullRequest({ headSha: VALIDATED_SHA }) });

    expect(canRecordBuilt({ file: SPEC, text: BUILT }, validatedHead, authority())).toBe(true);
  });

  test('een gemergde gesloten PR blijft geldig implementatiebewijs', () => {
    const merged = evidence({ pr: pullRequest({ state: 'closed', merged: true }) });

    expect(canRecordBuilt({ file: SPEC, text: BUILT }, merged, authority())).toBe(true);
  });

  test.each([
    { name: 'gesloten zonder merge', change: { pr: pullRequest({ state: 'closed', merged: false }) } },
    { name: 'verkeerd PR-nummer', change: { pr: pullRequest({ number: 124 }) } },
    { name: 'verkeerde PR-repository', change: { pr: pullRequest({ repository: 'owner/app' }) } },
    { name: 'verkeerde PR-branch', change: { pr: pullRequest({ branch: 'feat/other' }) } },
    { name: 'PR-head wijkt af van actuele head', change: { pr: pullRequest({ headSha: VALIDATED_SHA }) } },
    { name: 'actuele head wijkt af van PR-head', change: { headSha: VALIDATED_SHA } },
    { name: 'gekozen commit is geen voorouder', change: { ancestor: false } },
    { name: 'implementatie na validatie gewijzigd', change: { onlyStatuses: false } },
    { name: 'geen checks', change: { checks: [] } },
    { name: 'verplichte slowcheck ontbreekt', change: { checks: [check()] } },
    {
      name: 'alleen groene checks op statuscommit',
      change: { checks: evidence().checks.map((item) => ({ ...item, headSha: CURRENT_SHA })) },
    },
    {
      name: 'stale groen met latere failure',
      change: { checks: [...evidence().checks, check({ id: 200, conclusion: 'failure' })] },
    },
    { name: 'gelijknamige vervalste app', change: { checks: [check({ appId: 1 }), check({ name: 'gate:slow' })] } },
    { name: 'malformed actuele head', change: { headSha: 'invalid', pr: pullRequest({ headSha: 'invalid' }) } },
  ])('$name staat gebouwd niet toe', ({ change }) => {
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, evidence(change), authority())).toBe(false);
  });

  test.each([
    {
      name: 'geen trusted goedkeuring of registrybesluit',
      change: {
        trusted: () => APPROVED.replace('goedgekeurd', 'voorstel'),
        registry: { ...authority().registry, decisions: [] },
      },
    },
    { name: 'geen trusted document', change: { trusted: () => null } },
    {
      name: 'trusted inhoud verschilt',
      change: { trusted: () => APPROVED.replace('Afgebakende implementatie.', 'Andere implementatie.') },
    },
    { name: 'verkeerde repository', change: { repository: 'owner/app' } },
    { name: 'verkeerde branch', change: { branch: 'feat/other' } },
    { name: 'onveilig documentpad', change: { safe: () => false } },
    { name: 'geen verplichte checks', change: { registry: { ...authority().registry, requiredChecks: [] } } },
  ])('$name levert geen gebouwdrecht', ({ change }) => {
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, evidence(), authority(change))).toBe(false);
  });

  test.each([
    { name: 'goedgekeurd blijft goedgekeurd', text: APPROVED },
    { name: 'gebouwd zonder referentie', text: APPROVED.replace('goedgekeurd', 'gebouwd') },
    { name: 'PR nul', text: BUILT.replace('#123', '#0') },
    { name: 'korte SHA', text: BUILT.replace(VALIDATED_SHA, VALIDATED_SHA.slice(1)) },
    { name: 'niet-hex SHA', text: BUILT.replace(VALIDATED_SHA, 'g'.repeat(40)) },
    { name: 'andere gevalideerde SHA', text: BUILT.replace(VALIDATED_SHA, CURRENT_SHA) },
    { name: 'body veranderd', text: BUILT.replace('Afgebakende implementatie.', 'Uitgebreide implementatie.') },
  ])('$name geeft geen gebouwd-bewijs', ({ text }) => {
    expect(canRecordBuilt({ file: SPEC, text }, evidence(), authority())).toBe(false);
  });

  test('ADR gebouwd is onmogelijk, ook met groene PR-feiten', () => {
    const file = 'docs/adr/0027-built-evidence.md';
    const text = `# 0027 — Taak\n\nStatus: gebouwd # #123; gevalideerd: ${VALIDATED_SHA}\n\n## Besluit\n`;

    expect(canRecordBuilt({ file, text }, evidence(), authority())).toBe(false);
  });
});

describe('parsePullRequest: onbekende GitHub JSON omzetten naar verplichte PR-feiten', () => {
  test('de echte REST-veldstructuur levert de PR-identiteit op', () => {
    expect(parsePullRequest(rawPullRequest())).toStrictEqual(pullRequest());
  });

  test('de gemergde vlag blijft een expliciet booleanfeit', () => {
    expect(parsePullRequest(rawPullRequest({ state: 'closed', merged: true }))).toStrictEqual(
      pullRequest({ state: 'closed', merged: true }),
    );
  });

  test.each([null, [], {}, 123, 'PR'])('onvolledige JSON %j wordt geweigerd', (raw) => {
    expect(() => parsePullRequest(raw)).toThrow();
  });

  test.each(['number', 'base', 'head', 'state', 'merged'])('ontbrekend PR-veld %s wordt geweigerd', (key) => {
    expect(() => parsePullRequest(withoutKey(rawPullRequest(), key))).toThrow();
  });

  test.each([
    { name: 'base.repo ontbreekt', raw: rawPullRequest({ base: {} }) },
    { name: 'base.repo.full_name ontbreekt', raw: rawPullRequest({ base: { repo: {} } }) },
    { name: 'head.repo ontbreekt', raw: rawPullRequest({ head: withoutKey(rawPullRequest().head, 'repo') }) },
    { name: 'head.repo.full_name ontbreekt', raw: rawPullRequest({ head: { ...rawPullRequest().head, repo: {} } }) },
    { name: 'head.ref ontbreekt', raw: rawPullRequest({ head: withoutKey(rawPullRequest().head, 'ref') }) },
    { name: 'head.sha ontbreekt', raw: rawPullRequest({ head: withoutKey(rawPullRequest().head, 'sha') }) },
    { name: 'PR-nummer als tekst', raw: rawPullRequest({ number: '123' }) },
    { name: 'PR-nummer nul', raw: rawPullRequest({ number: 0 }) },
    { name: 'negatief PR-nummer', raw: rawPullRequest({ number: -1 }) },
    { name: 'fractioneel PR-nummer', raw: rawPullRequest({ number: 1.5 }) },
    { name: 'state als getal', raw: rawPullRequest({ state: 1 }) },
    { name: 'branch als getal', raw: rawPullRequest({ head: { ...rawPullRequest().head, ref: 1 } }) },
    { name: 'SHA als getal', raw: rawPullRequest({ head: { ...rawPullRequest().head, sha: 1 } }) },
    { name: 'merged als tekst', raw: rawPullRequest({ merged: 'true' }) },
    { name: 'merged als null', raw: rawPullRequest({ merged: null }) },
  ])('$name wordt geweigerd', ({ raw }) => {
    expect(() => parsePullRequest(raw)).toThrow();
  });

  test('een fork-head kan geen bewijs voor de base-repository leveren', () => {
    const raw = rawPullRequest({ head: { ...rawPullRequest().head, repo: { full_name: 'other/template' } } });

    expect(() => parsePullRequest(raw)).toThrow();
  });
});

describe('parseCheckRun: onbekende GitHub JSON omzetten naar verplichte check-feiten', () => {
  test('de echte REST-veldstructuur behoudt SHA, app-identiteit en run-id', () => {
    expect(parseCheckRun(rawCheckRun())).toStrictEqual(check());
  });

  test('een nog lopende check met nullconclusie kan worden gelezen, maar is geen groen bewijs', () => {
    const running = parseCheckRun(rawCheckRun({ status: 'in_progress', conclusion: null }));

    expect(running).toStrictEqual(check({ status: 'in_progress', conclusion: null }));
    expect(checkedCommit([running, check({ name: 'gate:slow' })], REQUIRED)).toBe(false);
  });

  test.each([null, [], {}, 123, 'check'])('onvolledige JSON %j wordt geweigerd', (raw) => {
    expect(() => parseCheckRun(raw)).toThrow();
  });

  test.each(['id', 'name', 'head_sha', 'status', 'conclusion', 'app'])(
    'ontbrekend checkveld %s wordt geweigerd',
    (key) => {
      expect(() => parseCheckRun(withoutKey(rawCheckRun(), key))).toThrow();
    },
  );

  test.each([
    { name: 'app.id ontbreekt', raw: rawCheckRun({ app: {} }) },
    { name: 'app ontbreekt als object', raw: rawCheckRun({ app: null }) },
    { name: 'app.id als tekst', raw: rawCheckRun({ app: { id: '15368' } }) },
    { name: 'app.id nul', raw: rawCheckRun({ app: { id: 0 } }) },
    { name: 'id als tekst', raw: rawCheckRun({ id: '101' }) },
    { name: 'id nul', raw: rawCheckRun({ id: 0 }) },
    { name: 'negatieve id', raw: rawCheckRun({ id: -1 }) },
    { name: 'fractionele id', raw: rawCheckRun({ id: 1.5 }) },
    { name: 'naam als getal', raw: rawCheckRun({ name: 1 }) },
    { name: 'SHA als getal', raw: rawCheckRun({ head_sha: 1 }) },
    { name: 'status als getal', raw: rawCheckRun({ status: 1 }) },
    { name: 'conclusie als boolean', raw: rawCheckRun({ conclusion: true }) },
  ])('$name wordt geweigerd', ({ raw }) => {
    expect(() => parseCheckRun(raw)).toThrow();
  });

  test('een andere app-identiteit wordt behouden en door de bewijsvalidator geweigerd', () => {
    const forged = parseCheckRun(rawCheckRun({ app: { id: 1 } }));

    expect(forged.appId).toBe(1);
    expect(checkedCommit([forged, check({ name: 'gate:slow' })], REQUIRED)).toBe(false);
  });
});

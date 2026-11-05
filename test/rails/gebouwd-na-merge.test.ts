import { describe, expect, test } from 'vitest';
import { canRecordBuilt } from '../../rails/hooks/lib/built-evidence.mjs';
import { parsePullRequest } from '../../scripts/kit/github-evidence.mjs';
import { roep } from '../hooks/follow-up-kit';

// docs/specs/gebouwd-na-merge.md: de gemergde route van `builtRefusal`/`canRecordBuilt` met ingevoegd bewijs (geen GitHub).
// `builtRefusal` en het veld `merged` bestaan nog niet; `roep` laadt de export dynamisch (zie follow-up-kit.ts).

type BuiltEvidence = Parameters<typeof canRecordBuilt>[1];
type Authority = Parameters<typeof canRecordBuilt>[2];
type CheckRun = BuiltEvidence['checks'][number];
type PullRequest = BuiltEvidence['pr'] & { mergeSha: string | null; baseBranch: string };
interface Merged {
  inHead: boolean;
  parents: string[];
  specAtMerge: string | null;
  requiredChecks: string[] | null;
  bouwpaden: string[];
}
type Bewijs = Omit<BuiltEvidence, 'pr'> & { pr: PullRequest; merged?: Merged };

const BUILT_EVIDENCE = ['../../rails/hooks/lib', 'built-evidence.mjs'].join('/');
const SPEC = 'docs/specs/bouw.md';
const REPOSITORY = 'BramLambertJansen/template';
const STATUS_BRANCH = 'docs/status-bouw';
const PR_BRANCH = 'feat/bouw';
const PR_HEAD = 'a'.repeat(40);
const STATUS_HEAD = 'b'.repeat(40);
const MERGE_SHA = 'c'.repeat(40);
const PARENT = 'd'.repeat(40);
const ANDER = 'e'.repeat(40);
const SOURCE = 'src/core/web/ui/example.tsx';
const APPROVED = `---\nstatus: goedgekeurd\nnamespace: bouw\n---\n\n# Bouw\n\nRaakt \`${SOURCE}\`.\n`;
const BUILT = APPROVED.replace('status: goedgekeurd', `status: gebouwd # #123; gevalideerd: ${PR_HEAD}`);

const GENERIEK = 'de juiste PR en gevalideerde commit';
const IN_HEAD = 'de mergecommit van PR #123 in HEAD';
const SPEC_BIJ_MERGE = 'de spec ongewijzigd en goedgekeurd in de mergecommit';
const CHECKS = 'alle verplichte GitHub Actions-checks groen op de head van PR #123';
const BOUWPAD = 'een wijziging buiten docs/ in PR #123 op een pad dat de spec noemt';
const ALLEEN = 'alleen statusregels en het eigen roadmapvinkje in deze PR';

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 101,
    name: 'gate:fast',
    headSha: PR_HEAD,
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
    branch: PR_BRANCH,
    headSha: PR_HEAD,
    state: 'closed',
    merged: true,
    mergeSha: MERGE_SHA,
    baseBranch: 'main',
    ...overrides,
  };
}

function merged(overrides: Partial<Merged> = {}): Merged {
  return {
    inHead: true,
    parents: [PARENT],
    specAtMerge: APPROVED,
    requiredChecks: ['gate:fast'],
    bouwpaden: [SOURCE],
    ...overrides,
  };
}

/** Lokale head, branch en voorouder horen bij de status-PR, niet bij PR n: in de gemergde route tellen ze niet. */
function evidence(overrides: Partial<Bewijs> = {}): Bewijs {
  return {
    pr: pullRequest(),
    checks: [check()],
    headSha: STATUS_HEAD,
    ancestor: false,
    onlyStatuses: true,
    merged: merged(),
    ...overrides,
  };
}

/** Bewijs zonder het veld `merged` (exactOptionalPropertyTypes: weglaten, niet op undefined zetten). */
function zonderMerged(overrides: Partial<Bewijs> = {}): Bewijs {
  const { pr, checks, headSha, ancestor, onlyStatuses } = evidence(overrides);
  return { pr, checks, headSha, ancestor, onlyStatuses };
}

function authority(overrides: Partial<Authority> = {}): Authority {
  return {
    // `gate:slow` kwam pas na de merge op main; in de gemergde route telt alleen de eerste ouder (AC-5).
    registry: { version: 1, requiredChecks: ['gate:fast', 'gate:slow'], decisions: [] },
    repository: REPOSITORY,
    branch: STATUS_BRANCH,
    trusted: (file) => (file === SPEC ? APPROVED : null),
    working: (file) => (file === SPEC ? BUILT : null),
    safe: () => true,
    ...overrides,
  };
}

async function weigering(bewijs: Bewijs, text = BUILT, auth: Authority = authority()): Promise<unknown> {
  return roep(BUILT_EVIDENCE, 'builtRefusal', { file: SPEC, text }, bewijs, auth);
}

describe('gebouwd-na-merge: de gemergde route van builtRefusal', () => {
  test('gebouwd-na-merge/AC-1: squash-merge met goedgekeurde spec, bouwpad en groene checks is toegestaan', async () => {
    expect(await weigering(evidence())).toBeNull();
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, evidence(), authority())).toBe(true);
  });

  test('gebouwd-na-merge/AC-1: mergecommit met de PR-head als tweede ouder is toegestaan', async () => {
    const bewijs = evidence({ merged: merged({ parents: [PARENT, PR_HEAD] }) });
    expect(await weigering(bewijs)).toBeNull();
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(true);
  });

  test('gebouwd-na-merge/AC-2: een status-PR die meer wijzigt dan statusregels en het eigen vinkje faalt', async () => {
    const bewijs = evidence({ onlyStatuses: false });
    expect(await weigering(bewijs)).toBe(ALLEEN);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
  });

  test.each([
    ['mergecommit niet in HEAD', { merged: merged({ inHead: false }) }],
    ['onleesbare ouders', { merged: merged({ parents: [] }) }],
    ['drie ouders', { merged: merged({ parents: [PARENT, PR_HEAD, ANDER] }) }],
    ['tweede ouder is niet de PR-head', { merged: merged({ parents: [PARENT, ANDER] }) }],
    [
      'niet in HEAD en ook andere wijzigingen: de eerste voorwaarde',
      { merged: merged({ inHead: false }), onlyStatuses: false },
    ],
  ])('gebouwd-na-merge/AC-3: %s faalt', async (_naam, change: Partial<Bewijs>) => {
    const bewijs = evidence(change);
    expect(await weigering(bewijs)).toBe(IN_HEAD);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
  });

  test.each(['feature-x', 'develop'])(
    'gebouwd-na-merge/AC-3: een PR gemerged in %s in plaats van main faalt',
    async (baseBranch) => {
      const bewijs = evidence({ pr: pullRequest({ baseBranch }) });
      expect(await weigering(bewijs)).toBe(IN_HEAD);
      expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
    },
  );

  test('gebouwd-na-merge/AC-3: zonder mergebewijs faalt', async () => {
    expect(await weigering(zonderMerged())).toBe(IN_HEAD);
  });

  test.each([
    ['spec ontbreekt in de mergecommit', null],
    ['spec op voorstel in de mergecommit', APPROVED.replace('goedgekeurd', 'voorstel')],
    ['erratum na de merge (andere digest)', APPROVED.replace('# Bouw', '# Bouw vóór het erratum')],
    ['geen geldig specdocument', 'geen frontmatter\n'],
  ])('gebouwd-na-merge/AC-4: %s faalt', async (_naam, specAtMerge) => {
    const bewijs = evidence({ merged: merged({ specAtMerge }) });
    expect(await weigering(bewijs)).toBe(SPEC_BIJ_MERGE);
  });

  test.each([
    ['check ontbreekt', []],
    ['check is niet success', [check({ conclusion: 'failure' })]],
    ['check van een andere app', [check({ appId: 1 })]],
    ['check alleen op de mergecommit', [check({ headSha: MERGE_SHA })]],
    ['check alleen op de statuscommit', [check({ headSha: STATUS_HEAD })]],
  ])('gebouwd-na-merge/AC-5: %s faalt', async (_naam, checks) => {
    const bewijs = evidence({ checks });
    expect(await weigering(bewijs)).toBe(CHECKS);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
  });

  test('gebouwd-na-merge/AC-5: een verplichte check uit de eerste ouder die ontbreekt, faalt', async () => {
    const bewijs = evidence({ merged: merged({ requiredChecks: ['gate:fast', 'gate:slow'] }) });
    expect(await weigering(bewijs)).toBe(CHECKS);
  });

  test('gebouwd-na-merge/AC-5: een check die pas na de merge aan requiredChecks is toegevoegd, telt niet mee', async () => {
    expect(authority().registry.requiredChecks).toContain('gate:slow');
    expect(await weigering(evidence())).toBeNull();
  });

  test.each([
    ['gevalideerd: de mergecommit', BUILT.replace(PR_HEAD, MERGE_SHA)],
    ['gevalideerd: een andere commit', BUILT.replace(PR_HEAD, ANDER)],
  ])('gebouwd-na-merge/AC-6: %s faalt', async (_naam, text) => {
    const sha = /gevalideerd: ([0-9a-f]{40})/.exec(text)?.[1] ?? '';
    const bewijs = evidence({ checks: [check(), check({ id: 102, headSha: sha })] });
    expect(await weigering(bewijs, text)).toBe(GENERIEK);
  });

  test.each([
    ['ander PR-nummer', { pr: pullRequest({ number: 124 }) }],
    ['andere repository', { pr: pullRequest({ repository: 'owner/app' }) }],
  ])('gebouwd-na-merge/AC-6: %s faalt', async (_naam, change) => {
    expect(await weigering(evidence(change))).toBe(GENERIEK);
  });

  test('gebouwd-na-merge/AC-6: zonder vertrouwde goedkeuring op main faalt het', async () => {
    const auth = authority({ trusted: () => APPROVED.replace('goedgekeurd', 'voorstel') });
    expect(await weigering(evidence(), BUILT, auth)).toBe(GENERIEK);
  });

  test('gebouwd-na-merge/AC-7: een PR die gesloten is zonder merge faalt', async () => {
    const bewijs = evidence({ pr: pullRequest({ merged: false, mergeSha: null }) });
    expect(await weigering(bewijs)).toBe(GENERIEK);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
  });

  test('gebouwd-na-merge/AC-7: een gesloten PR faalt ook met bewijs dat de open route zou dragen', async () => {
    const pr = pullRequest({ merged: false, mergeSha: null, branch: STATUS_BRANCH, headSha: STATUS_HEAD });
    const checks = [check(), check({ id: 102, name: 'gate:slow' })];
    const bewijs = evidence({ pr, checks, headSha: STATUS_HEAD, ancestor: true });
    expect(await weigering(bewijs)).toBe(GENERIEK);
  });

  test('gebouwd-na-merge/AC-8: een open PR gedraagt zich als nu', async () => {
    const pr = pullRequest({
      state: 'open',
      merged: false,
      mergeSha: null,
      branch: STATUS_BRANCH,
      headSha: STATUS_HEAD,
    });
    const checks = [check(), check({ id: 102, name: 'gate:slow' })];
    const bewijs = zonderMerged({ pr, checks, headSha: STATUS_HEAD, ancestor: true });
    expect(await weigering(bewijs)).toBeNull();
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(true);
    expect(await weigering({ ...bewijs, ancestor: false })).toBe(GENERIEK);
    expect(await weigering({ ...bewijs, headSha: ANDER })).toBe(GENERIEK);
  });

  test('gebouwd-na-merge/AC-8: een open PR gaat niet via de gemergde route', async () => {
    const pr = pullRequest({ state: 'open', merged: false, mergeSha: null });
    expect(await weigering(evidence({ pr }))).toBe(GENERIEK);
  });

  test('gebouwd-na-merge/AC-8: een gemergde PR gaat nooit via de open route, ook niet met lokale head en branch van PR n', async () => {
    const auth = authority({ branch: PR_BRANCH });
    const bewijs = zonderMerged({ headSha: PR_HEAD, ancestor: true });
    expect(await weigering(bewijs, BUILT, auth)).toBe(IN_HEAD);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, auth)).toBe(false);
  });

  test('gebouwd-na-merge/AC-10: een gemergde PR zonder bouwpad faalt', async () => {
    const bewijs = evidence({ merged: merged({ bouwpaden: [] }) });
    expect(await weigering(bewijs)).toBe(BOUWPAD);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
  });

  test.each([
    ['geen leesbaar decisions.json', null],
    ['lege requiredChecks', []],
  ])('gebouwd-na-merge/AC-11: %s in de eerste ouder faalt', async (_naam, requiredChecks) => {
    const bewijs = evidence({ merged: merged({ requiredChecks }) });
    expect(await weigering(bewijs)).toBe(CHECKS);
    expect(canRecordBuilt({ file: SPEC, text: BUILT }, bewijs, authority())).toBe(false);
  });
});

function rawPullRequest(overrides: Record<string, unknown> = {}) {
  return {
    number: 123,
    base: { ref: 'main', repo: { full_name: REPOSITORY } },
    head: { repo: { full_name: REPOSITORY }, ref: PR_BRANCH, sha: PR_HEAD },
    state: 'closed',
    merged: true,
    merge_commit_sha: MERGE_SHA,
    ...overrides,
  };
}

describe('gebouwd-na-merge: parsePullRequest levert de mergecommit', () => {
  test('gebouwd-na-merge/AC-1: een gemergde PR draagt merge_commit_sha als mergeSha', () => {
    expect(parsePullRequest(rawPullRequest())).toStrictEqual(pullRequest());
  });

  test('gebouwd-na-merge/AC-3: parsePullRequest leest de basisbranch uit base.ref', () => {
    const raw = rawPullRequest({ base: { ref: 'feature-x', repo: { full_name: REPOSITORY } } });
    expect(parsePullRequest(raw)).toStrictEqual(pullRequest({ baseBranch: 'feature-x' }));
    expect(() => parsePullRequest(rawPullRequest({ base: { repo: { full_name: REPOSITORY } } }))).toThrow();
  });

  test('gebouwd-na-merge/AC-8: een open PR heeft geen mergeSha, ook niet met een testmerge-SHA van GitHub', () => {
    const raw = rawPullRequest({ state: 'open', merged: false });
    expect(parsePullRequest(raw)).toStrictEqual(pullRequest({ state: 'open', merged: false, mergeSha: null }));
  });

  test.each([
    ['ontbreekt', undefined],
    ['null', null],
    ['te kort', MERGE_SHA.slice(1)],
    ['geen hex', 'g'.repeat(40)],
    ['getal', 1],
  ])('gebouwd-na-merge/AC-1: een gemergde PR waarvan merge_commit_sha %s is, wordt geweigerd', (_naam, sha) => {
    expect(() => parsePullRequest(rawPullRequest({ merge_commit_sha: sha }))).toThrow(/merge_commit_sha/);
  });

  test('gebouwd-na-merge/AC-7: een gemergde PR uit een fork wordt geweigerd', () => {
    const raw = rawPullRequest({ head: { repo: { full_name: 'other/template' }, ref: PR_BRANCH, sha: PR_HEAD } });
    expect(() => parsePullRequest(raw)).toThrow();
  });
});

import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { changeStatus, documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { canRecordStatus, readRegistry } from '../../rails/hooks/lib/task-authority.mjs';

const SPEC = 'docs/specs/framework-task.md';
const ADR = 'docs/adr/0027-framework-task.md';
const TEMPLATE = 'BramLambertJansen/template';
const BRANCH = 'feat/framework-task';
const SOURCE = 'src/core/web/ui/example.tsx';
const SHA = 'a'.repeat(40);
const PROPOSED = '---\nstatus: voorstel\nnamespace: framework-task\n---\n\n# Taak\n\nExacte scope.\n';
const APPROVED = PROPOSED.replace('status: voorstel', 'status: goedgekeurd');
const BUILT = PROPOSED.replace('status: voorstel', `status: gebouwd # #42; gevalideerd: ${SHA}`);
const ADR_PROPOSED = '# 0027 — Taak\n\nStatus: voorgesteld — 2026-10-13.\n\n## Besluit\n\nExacte inhoud.\n';
const ADR_ACCEPTED = ADR_PROPOSED.replace('Status: voorgesteld', 'Status: geaccepteerd');
const SPEC_CANONICAL = PROPOSED.replace('status: voorstel\n', '');
const DIGEST = createHash('sha256').update(SPEC_CANONICAL).digest('hex');

interface Decision {
  file: string;
  digest: string;
  repository: string;
  branch: string;
  status: string;
  paths: string[];
}

interface Registry {
  version: 1;
  requiredChecks: string[];
  decisions: Decision[];
}

interface Authority {
  registry: Registry;
  repository: string;
  branch: string;
  trusted: (file: string) => string | null;
  working: (file: string) => string | null;
  safe: (file: string) => boolean;
}

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    file: SPEC,
    digest: DIGEST,
    repository: TEMPLATE,
    branch: BRANCH,
    status: 'goedgekeurd',
    paths: [SOURCE],
    ...overrides,
  };
}

function registry(decisions: Decision[] = [decision()]): Registry {
  return { version: 1, requiredChecks: ['gate:fast'], decisions };
}

function authority(overrides: Partial<Authority> = {}): Authority {
  return {
    registry: registry(),
    repository: TEMPLATE,
    branch: BRANCH,
    trusted: (file) => (file === SPEC ? PROPOSED : null),
    working: (file) => (file === SPEC ? APPROVED : null),
    safe: () => true,
    ...overrides,
  };
}

describe('documentInfo: inhoud en afgeleide status scheiden', () => {
  test('de digest verwijdert precies de statusregel en normaliseert CRLF', () => {
    const proposed = documentInfo(SPEC, PROPOSED);

    expect(proposed).toStrictEqual({ kind: 'spec', status: 'voorstel', canonical: SPEC_CANONICAL, digest: DIGEST });
    expect(documentInfo(SPEC, APPROVED)?.digest).toBe(DIGEST);
    expect(documentInfo(SPEC, BUILT)?.digest).toBe(DIGEST);
    expect(documentInfo(SPEC, PROPOSED.replaceAll('\n', '\r\n'))?.canonical).toBe(SPEC_CANONICAL);
  });

  test.each([
    { name: 'body', text: PROPOSED.replace('Exacte scope.', 'Uitgebreide scope.') },
    { name: 'frontmatter', text: PROPOSED.replace('namespace: framework-task', 'namespace: andere-taak') },
    { name: 'witruimte in de inhoud', text: PROPOSED.replace('Exacte scope.', ' Exacte scope.') },
    { name: 'laatste newline', text: PROPOSED.slice(0, -1) },
  ])('$name verandert de digest', ({ text }) => {
    const info = documentInfo(SPEC, text);

    expect(info).not.toBeNull();
    expect(info?.digest).not.toBe(DIGEST);
  });

  test.each(['voorstel', 'goedgekeurd', 'gebouwd', 'vervallen'])('specstatus %s is geldig', (status) => {
    expect(documentInfo(SPEC, PROPOSED.replace('status: voorstel', `status: ${status}`))?.status).toBe(status);
  });

  test.each(['voorgesteld', 'geaccepteerd', 'vervangen door 0028', 'vervallen'])(
    'ADR-status %s is geldig',
    (status) => {
      expect(documentInfo(ADR, ADR_PROPOSED.replace('Status: voorgesteld', `Status: ${status}`))?.status).toBe(status);
    },
  );

  test('een ADR-status wijzigt de inhoudsdigest niet', () => {
    const proposed = documentInfo(ADR, ADR_PROPOSED);

    expect(proposed?.kind).toBe('adr');
    expect(documentInfo(ADR, ADR_ACCEPTED)?.canonical).toBe(proposed?.canonical);
    expect(documentInfo(ADR, ADR_ACCEPTED)?.digest).toBe(proposed?.digest);
  });

  test.each([
    { name: 'verkeerd bestand', file: 'README.md', text: APPROVED },
    { name: 'spec zonder frontmatter', file: SPEC, text: 'status: goedgekeurd\n\n# Taak\n' },
    { name: 'niet gesloten frontmatter', file: SPEC, text: '---\nstatus: goedgekeurd\n# Taak\n' },
    { name: 'status alleen in body', file: SPEC, text: '---\nnamespace: taak\n---\nstatus: goedgekeurd\n' },
    { name: 'dubbele specstatus', file: SPEC, text: APPROVED.replace('namespace:', 'status: voorstel\nnamespace:') },
    { name: 'extra specstatus in body', file: SPEC, text: `${APPROVED}\nstatus: voorstel\n` },
    { name: 'ADR-status in spec', file: SPEC, text: PROPOSED.replace('status: voorstel', 'status: geaccepteerd') },
    {
      name: 'onbekende specstatus',
      file: SPEC,
      text: PROPOSED.replace('status: voorstel', 'status: goedgekeurd-extra'),
    },
    { name: 'ongeldige frontmatterregel', file: SPEC, text: PROPOSED.replace('namespace:', 'namespace') },
    { name: 'ADR gebouwd', file: ADR, text: ADR_PROPOSED.replace('Status: voorgesteld', 'Status: gebouwd') },
    { name: 'dubbele ADR-status', file: ADR, text: `${ADR_PROPOSED}\nStatus: geaccepteerd\n` },
    { name: 'ADR-status onder besluit', file: ADR, text: '# 0027 — Taak\n\n## Besluit\n\nStatus: geaccepteerd\n' },
    { name: 'te kort vervangingsnummer', file: ADR, text: ADR_PROPOSED.replace('voorgesteld', 'vervangen door 28') },
  ])('$name geeft geen documentbewijs', ({ file, text }) => {
    expect(documentInfo(file, text)).toBeNull();
  });
});

describe('changeStatus: formatter, geen eigenaartoestemming', () => {
  test('gebouwd legt PR en volledige gevalideerde SHA vast zonder bodywijziging', () => {
    const changed = changeStatus(SPEC, APPROVED, { status: 'gebouwd', pr: 42, validatedSha: SHA });

    expect(changed).toBe(BUILT);
    expect(documentInfo(SPEC, changed)?.digest).toBe(DIGEST);
  });

  test.each([
    { name: 'ontbrekend bewijs', options: { status: 'gebouwd' } },
    { name: 'ontbrekende SHA', options: { status: 'gebouwd', pr: 42 } },
    { name: 'ontbrekende PR', options: { status: 'gebouwd', validatedSha: SHA } },
    { name: 'PR nul', options: { status: 'gebouwd', pr: 0, validatedSha: SHA } },
    { name: 'negatieve PR', options: { status: 'gebouwd', pr: -1, validatedSha: SHA } },
    { name: 'fractionele PR', options: { status: 'gebouwd', pr: 1.5, validatedSha: SHA } },
    { name: 'korte SHA', options: { status: 'gebouwd', pr: 42, validatedSha: SHA.slice(1) } },
    { name: 'niet-hex SHA', options: { status: 'gebouwd', pr: 42, validatedSha: 'g'.repeat(40) } },
  ])('$name wordt geweigerd', ({ options }) => {
    expect(() => changeStatus(SPEC, APPROVED, options)).toThrow();
  });

  test('ADR vervangen is toegestaan; gebouwd en specstatussen zijn ongeldig', () => {
    expect(changeStatus(ADR, ADR_ACCEPTED, { status: 'vervangen door 0028' })).toContain('Status: vervangen door 0028');
    expect(() => changeStatus(ADR, ADR_ACCEPTED, { status: 'gebouwd', pr: 42, validatedSha: SHA })).toThrow();
    expect(() => changeStatus(ADR, ADR_ACCEPTED, { status: 'goedgekeurd' })).toThrow();
    expect(() => changeStatus(SPEC, APPROVED, { status: 'geaccepteerd' })).toThrow();
  });
});

// AC-15: readRegistry blijft tolerant en strikt: oude main-commits met records worden nog gelezen (status-git.mjs).
describe('readRegistry: strikte eigenaarsbesluiten', () => {
  test('de complete fixture wordt ongewijzigd gelezen', () => {
    const expected = registry();

    expect(readRegistry(JSON.stringify(expected))).toStrictEqual(expected);
  });

  // GEWIJZIGD (spec padtabel AC-14, ADR 0079, eigenaarakkoord 2026-11-04): een register zonder `decisions` werd geweigerd;
  // sinds de besluitrecords vervallen is het de normale vorm en wordt het gelezen met een lege lijst.
  test('ontbrekende besluiten wordt gelezen als lege lijst', () => {
    expect(readRegistry(JSON.stringify({ version: 1, requiredChecks: ['gate:fast'] }))).toStrictEqual({
      version: 1,
      requiredChecks: ['gate:fast'],
      decisions: [],
    });
  });

  test.each([
    { name: 'geen JSON', text: '{' },
    { name: 'null', text: 'null' },
    { name: 'array', text: '[]' },
    { name: 'ontbrekende version', text: JSON.stringify({ requiredChecks: ['gate:fast'], decisions: [] }) },
    { name: 'ontbrekende checks', text: JSON.stringify({ version: 1, decisions: [] }) },
    { name: 'onbekende versie', text: JSON.stringify({ ...registry(), version: 2 }) },
    { name: 'onbekende sleutel', text: JSON.stringify({ ...registry(), approved: true }) },
    { name: 'checks als tekst', text: JSON.stringify({ ...registry(), requiredChecks: 'gate:fast' }) },
    { name: 'check als getal', text: JSON.stringify({ ...registry(), requiredChecks: [1] }) },
    { name: 'besluiten als object', text: JSON.stringify({ ...registry(), decisions: {} }) },
  ])('$name wordt geweigerd', ({ text }) => {
    expect(() => readRegistry(text)).toThrow();
  });

  test.each(['file', 'digest', 'repository', 'branch', 'status', 'paths'])(
    'ontbrekend besluitveld %s wordt geweigerd',
    (key) => {
      const incomplete = { ...decision() };
      Reflect.deleteProperty(incomplete, key);

      expect(() => readRegistry(JSON.stringify({ ...registry(), decisions: [incomplete] }))).toThrow();
    },
  );

  test.each([
    { name: 'onbekend besluitveld', value: { ...decision(), approved: true } },
    { name: 'te korte digest', value: decision({ digest: 'a'.repeat(63) }) },
    { name: 'niet-hex digest', value: decision({ digest: 'g'.repeat(64) }) },
    { name: 'mainbranch', value: decision({ branch: 'main' }) },
    { name: 'lege branch', value: decision({ branch: '' }) },
    { name: 'repository zonder eigenaar', value: decision({ repository: 'template' }) },
    { name: 'repository als URL', value: decision({ repository: 'https://github.com/owner/template' }) },
    { name: 'repository met extra segment', value: decision({ repository: 'owner/template/extra' }) },
    { name: 'gebouwd als toestemming', value: decision({ status: 'gebouwd' }) },
    { name: 'onbekende status', value: decision({ status: 'approved' }) },
    { name: 'ADR-status voor spec', value: decision({ status: 'geaccepteerd' }) },
    { name: 'specstatus voor ADR', value: decision({ file: ADR, status: 'goedgekeurd' }) },
    { name: 'verkeerde docmap', value: decision({ file: 'docs/framework-task.md' }) },
    { name: 'nested spec', value: decision({ file: 'docs/specs/nested/task.md' }) },
    { name: 'niet-kebab spec', value: decision({ file: 'docs/specs/FrameworkTask.md' }) },
    { name: 'spec-template', value: decision({ file: 'docs/specs/_template.md' }) },
    { name: 'ADR zonder vier cijfers', value: decision({ file: 'docs/adr/27-framework-task.md' }) },
    { name: 'paths als tekst', value: { ...decision(), paths: SOURCE } },
    { name: 'path als getal', value: { ...decision(), paths: [42] } },
  ])('$name wordt geweigerd', ({ value }) => {
    expect(() => readRegistry(JSON.stringify({ ...registry(), decisions: [value] }))).toThrow();
  });

  test.each([
    '/src/core/web/ui/example.tsx',
    '../src/core/web/ui/example.tsx',
    'src/core/../web/ui/example.tsx',
    'src/core/./web/ui/example.tsx',
    'src/core//web/ui/example.tsx',
    'src\\core\\web\\ui\\example.tsx',
    'src/core/**',
    'src/core/web/ui/example?.tsx',
    'src/core/web/ui/[example].tsx',
    'src/core/web/ui/{example,other}.tsx',
  ])('niet-exact path %s wordt geweigerd', (file) => {
    expect(() => readRegistry(JSON.stringify(registry([decision({ paths: [file] })])))).toThrow();
  });
});

describe('canRecordStatus: alleen inhoudelijk bewezen administratie', () => {
  // AC-15 (compacte-kennisbasis-rails, PR 6b): record geeft niets meer; alleen dezelfde status en digest als main telt.
  test('een registrybesluit geeft geen statusrecht meer, ook niet voor zijn doelstatus', () => {
    expect(canRecordStatus({ file: SPEC, text: APPROVED }, authority())).toBe(false);
    expect(canRecordStatus({ file: SPEC, text: PROPOSED }, authority())).toBe(false);
    expect(canRecordStatus({ file: SPEC, text: APPROVED.replace('goedgekeurd', 'vervallen') }, authority())).toBe(
      false,
    );
  });

  // GEWIJZIGD (AC-15, review): de basis is nu WAAR (main heeft dezelfde status en digest, geen record); elke rij verandert
  // precies één voorwaarde en moet daardoor onwaar worden. Eerder was elke rij onwaar door het ontbrekende record.
  const geldig = (change: Partial<Authority> = {}) =>
    authority({ trusted: (file) => (file === SPEC ? APPROVED : null), registry: registry([]), ...change });

  test('de basis is waar: main heeft dezelfde goedgekeurde status en digest', () => {
    expect(canRecordStatus({ file: SPEC, text: APPROVED }, geldig())).toBe(true);
  });

  test.each([
    { name: 'geen vertrouwde spec', change: { trusted: () => null } },
    { name: 'onveilige documentlocatie', change: { safe: () => false } },
    { name: 'main heeft voorstel', change: { trusted: () => PROPOSED } },
    { name: 'main heeft een andere status', change: { trusted: () => APPROVED.replace('goedgekeurd', 'vervallen') } },
    {
      name: 'main heeft een andere inhoud',
      change: { trusted: () => APPROVED.replace('Exacte scope.', 'Meer scope.') },
    },
  ])('$name verleent geen statusrecht', ({ change }) => {
    expect(canRecordStatus({ file: SPEC, text: APPROVED }, geldig(change))).toBe(false);
  });

  test('een andere doelstatus of inhoud dan main verleent geen statusrecht', () => {
    expect(canRecordStatus({ file: SPEC, text: APPROVED.replace('goedgekeurd', 'vervallen') }, geldig())).toBe(false);
    expect(canRecordStatus({ file: SPEC, text: APPROVED.replace('Exacte scope.', 'Meer scope.') }, geldig())).toBe(
      false,
    );
  });

  test('een passend record op een voorstel in main geeft nog steeds geen statusrecht', () => {
    expect(
      canRecordStatus({ file: SPEC, text: APPROVED }, geldig({ trusted: () => PROPOSED, registry: registry() })),
    ).toBe(false);
  });

  test.each([
    APPROVED.replace('Exacte scope.', 'Meer scope.'),
    APPROVED.replace('namespace: framework-task', 'namespace: vervalst'),
    `${APPROVED}\nstatus: goedgekeurd\n`,
  ])('een bodywijziging of dubbele status wordt geweigerd', (text) => {
    expect(canRecordStatus({ file: SPEC, text }, authority())).toBe(false);
  });

  test('lokale goedkeuring zonder trusted besluit geeft geen bewijs', () => {
    const untrusted = authority({ trusted: () => null, working: () => APPROVED, registry: registry([]) });

    expect(canRecordStatus({ file: SPEC, text: APPROVED }, untrusted)).toBe(false);
  });

  test('dezelfde reeds goedgekeurde spec blijft geldig zonder nieuw besluit', () => {
    const existing = authority({ trusted: () => APPROVED, registry: registry([]) });

    expect(canRecordStatus({ file: SPEC, text: APPROVED }, existing)).toBe(true);
    expect(canRecordStatus({ file: SPEC, text: PROPOSED }, existing)).toBe(false);
    expect(canRecordStatus({ file: SPEC, text: APPROVED.replace('Exacte scope.', 'Meer scope.') }, existing)).toBe(
      false,
    );
  });

  test('een bestaande geaccepteerde ADR blijft geldig zonder nieuw besluit', () => {
    const existing = authority({ trusted: (file) => (file === ADR ? ADR_ACCEPTED : null), registry: registry([]) });

    expect(canRecordStatus({ file: ADR, text: ADR_ACCEPTED }, existing)).toBe(true);
    expect(canRecordStatus({ file: ADR, text: ADR_PROPOSED }, existing)).toBe(false);
  });

  // AC-15: record geeft niets meer; ook een passend ADR-besluit geeft geen acceptatierecht.
  test('ADR-acceptatie wordt niet meer uit een passend registrybesluit afgeleid', () => {
    const digest = createHash('sha256')
      .update(ADR_PROPOSED.replace('Status: voorgesteld — 2026-10-13.\n', ''))
      .digest('hex');
    const accepted = authority({
      trusted: (file) => (file === ADR ? ADR_PROPOSED : null),
      working: (file) => (file === ADR ? ADR_ACCEPTED : null),
      registry: registry([decision({ file: ADR, digest, status: 'geaccepteerd', paths: [] })]),
    });

    expect(canRecordStatus({ file: ADR, text: ADR_ACCEPTED }, accepted)).toBe(false);
    expect(canRecordStatus({ file: ADR, text: ADR_ACCEPTED }, { ...accepted, registry: registry([]) })).toBe(false);
  });

  test.each([PROPOSED, APPROVED, BUILT])('gebouwd wordt nooit door statusadministratie toegestaan', (trusted) => {
    expect(canRecordStatus({ file: SPEC, text: BUILT }, authority({ trusted: () => trusted }))).toBe(false);
  });
});

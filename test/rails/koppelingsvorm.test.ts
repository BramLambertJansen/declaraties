import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { koppelingsmappen, koppelingsvormFouten } from '../../scripts/kit/check-koppelingsvorm.mjs';
import { integrations } from '../../src/api/integrations/index.ts';

// Spec koppelingsvorm, AC-1 t/m AC-4: de check op de vaste vorm per koppeling. De fixture-mappen staan in een tijdelijke
// map onder TMPDIR (test/setup/tmp-root.ts ruimt op), zodat er geen .ts-fixtures in typecheck, lint of depcruise komen.

const repo = path.join(import.meta.dirname, '../..');
const PARTS = ['port.ts', 'adapter.ts', 'schemas.ts', 'contract.test.ts', 'fixtures'] as const;

// Een lege app-root met src/api/integrations/index.ts.
function appRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'koppelingsvorm-'));
  mkdirSync(path.join(root, 'src/api/integrations'), { recursive: true });
  writeFileSync(path.join(root, 'src/api/integrations/index.ts'), 'export const integrations = [];\n');
  return root;
}

function dirOf(root: string, name: string): string {
  return path.join(root, 'src/api/integrations', name);
}

// Een map in de vaste vorm: vijf onderdelen, één fixture, describeContract( met de naam als letterlijke tekst.
function goodMap(root: string, name: string): string {
  const dir = dirOf(root, name);
  mkdirSync(path.join(dir, 'fixtures'), { recursive: true });
  writeFileSync(
    path.join(dir, 'port.ts'),
    'export interface Port { readonly item: (id: string) => Promise<string> }\n',
  );
  writeFileSync(path.join(dir, 'adapter.ts'), 'export const createAdapter = () => () => ({});\n');
  writeFileSync(path.join(dir, 'schemas.ts'), "import { z } from 'zod';\nexport const item = z.object({});\n");
  writeFileSync(path.join(dir, 'contract.test.ts'), `describeContract({ name: '${name}', probe: {} }, []);\n`);
  writeFileSync(path.join(dir, 'fixtures/item.json'), '{ "id": "i-1" }\n');
  return dir;
}

function errorsFor(root: string, names: readonly string[]): string[] {
  return koppelingsvormFouten({ items: koppelingsmappen(root), names });
}

describe('koppelingsvorm/AC-1: een map in de vaste vorm', () => {
  test('koppelingsvorm/AC-1: alle vijf onderdelen, een fixture en describeContract met de naam geven []', () => {
    const root = appRoot();
    goodMap(root, 'proefpartner');

    expect(errorsFor(root, ['proefpartner'])).toStrictEqual([]);
  });

  test.each(PARTS)('koppelingsvorm/AC-1: zonder %s precies één fout die map en onderdeel noemt', (part) => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    rmSync(path.join(dir, part), { recursive: true });

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('proefpartner');
    expect(errors[0]).toContain(part);
  });
});

describe('koppelingsvorm/AC-2: afwijkingen in register en inhoud', () => {
  test('koppelingsvorm/AC-2: een map die niet in names staat', () => {
    const root = appRoot();
    goodMap(root, 'proefpartner');

    const errors = errorsFor(root, []);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('proefpartner');
  });

  test('koppelingsvorm/AC-2: een naam in names zonder map', () => {
    const root = appRoot();

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('proefpartner');
  });

  test('koppelingsvorm/AC-2: een los bestand naast index.ts', () => {
    const root = appRoot();
    goodMap(root, 'proefpartner');
    writeFileSync(path.join(root, 'src/api/integrations/helper.ts'), 'export const helper = 1;\n');

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('helper.ts');
  });

  test('koppelingsvorm/AC-2: een extra bestand in een map', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    writeFileSync(path.join(dir, 'helper.ts'), 'export const helper = 1;\n');

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('proefpartner');
    expect(errors[0]).toContain('helper.ts');
  });

  test('koppelingsvorm/AC-2: een lege fixtures/', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    rmSync(path.join(dir, 'fixtures/item.json'));

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('fixtures');
  });

  test.each([
    ['zonder describeContract(', "export const contract = { name: 'proefpartner' };\n"],
    ['zonder de mapnaam als letterlijke tekst', 'describeContract({ name: NAAM }, []); // proefpartner\n'],
    ['met een andere naam als letterlijke tekst', "describeContract({ name: 'proefpartner-twee' }, []);\n"],
  ])('koppelingsvorm/AC-2: contract.test.ts %s', (_label, text) => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    writeFileSync(path.join(dir, 'contract.test.ts'), text);

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('contract.test.ts');
  });

  test('koppelingsvorm/AC-2: de naam met dubbele aanhalingstekens telt als letterlijke tekst', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    writeFileSync(path.join(dir, 'contract.test.ts'), 'describeContract({ name: "proefpartner" }, []);\n');

    expect(errorsFor(root, ['proefpartner'])).toStrictEqual([]);
  });

  test('koppelingsvorm/AC-2: op de repo zelf geeft de check []', () => {
    expect(koppelingsvormFouten({ items: koppelingsmappen(repo), names: integrations.names })).toStrictEqual([]);
  });
});

describe('koppelingsvorm/AC-3: naam, soort en symlinks', () => {
  test('koppelingsvorm/AC-3: een map Proef_Partner (buiten het patroon)', () => {
    const root = appRoot();
    goodMap(root, 'Proef_Partner');

    const errors = errorsFor(root, ['Proef_Partner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Proef_Partner');
  });

  test('koppelingsvorm/AC-3: een map port.ts in plaats van een bestand', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    rmSync(path.join(dir, 'port.ts'));
    mkdirSync(path.join(dir, 'port.ts'));
    writeFileSync(path.join(dir, 'port.ts/index.ts'), 'export {};\n');

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('port.ts');
  });

  test('koppelingsvorm/AC-3: een bestand fixtures in plaats van een map', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    rmSync(path.join(dir, 'fixtures'), { recursive: true });
    writeFileSync(path.join(dir, 'fixtures'), '{}\n');

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('fixtures');
  });

  test('koppelingsvorm/AC-3: een symlink als onderdeel', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    const elsewhere = path.join(root, 'elders.ts');
    writeFileSync(elsewhere, 'export interface Port { readonly item: (id: string) => Promise<string> }\n');
    rmSync(path.join(dir, 'port.ts'));
    symlinkSync(elsewhere, path.join(dir, 'port.ts'));

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors.some((error) => error.includes('port.ts'))).toBe(true);
  });

  test('koppelingsvorm/AC-3: een symlink in fixtures/', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    const elsewhere = path.join(root, 'elders.json');
    writeFileSync(elsewhere, '{}\n');
    symlinkSync(elsewhere, path.join(dir, 'fixtures/gelinkt.json'));

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors.some((error) => error.includes('gelinkt.json'))).toBe(true);
  });
});

describe('koppelingsvorm/AC-4: verborgen namen, submappen en een app zonder koppelingen', () => {
  test('koppelingsvorm/AC-4: fixtures/ met alleen .gitkeep geeft "fixtures zonder bestand"', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    rmSync(path.join(dir, 'fixtures/item.json'));
    writeFileSync(path.join(dir, 'fixtures/.gitkeep'), '');

    const errors = errorsFor(root, ['proefpartner']);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('fixtures zonder bestand');
  });

  test('koppelingsvorm/AC-4: fixtures/ met alleen een bestand in een submap geeft []', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    rmSync(path.join(dir, 'fixtures/item.json'));
    mkdirSync(path.join(dir, 'fixtures/items'));
    writeFileSync(path.join(dir, 'fixtures/items/i-1.json'), '{ "id": "i-1" }\n');

    expect(errorsFor(root, ['proefpartner'])).toStrictEqual([]);
  });

  test('koppelingsvorm/AC-4: een .DS_Store naast de vijf onderdelen en naast index.ts geeft []', () => {
    const root = appRoot();
    const dir = goodMap(root, 'proefpartner');
    writeFileSync(path.join(dir, '.DS_Store'), '');
    writeFileSync(path.join(root, 'src/api/integrations/.DS_Store'), '');

    expect(errorsFor(root, ['proefpartner'])).toStrictEqual([]);
  });

  test('koppelingsvorm/AC-4: zonder src/api/integrations geeft de check [] zonder uitzondering', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'koppelingsvorm-leeg-'));

    expect(koppelingsmappen(root)).toStrictEqual([]);
    expect(koppelingsvormFouten({ items: koppelingsmappen(root), names: [] })).toStrictEqual([]);
  });
});

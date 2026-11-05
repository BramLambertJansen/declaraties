import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { maakRepo, opruimen, write } from '../hooks/follow-up-kit';

// compacte-kennisbasis-rails/AC-3 (ADR 0053 punt 3 en 5, ADR 0063 punt 4): `feiten adr` telt `docs/adr/` en `archief/` samen voor het
// volgende nummer en toont standaard alleen `docs/adr/`.
afterEach(opruimen);
const script = path.resolve('scripts/kit/feiten.mjs');
const schema = z.object({ adr: z.object({ volgende: z.string(), lijst: z.array(z.object({ nummer: z.string() })) }) });
const adr = (nr: string, status: string): string => `# ${nr} — Demo\n\nStatus: ${status}\n`;

function feiten(root: string) {
  const result = spawnSync(process.execPath, [script, 'adr', '--json'], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return schema.parse(JSON.parse(result.stdout)).adr;
}

describe('compacte-kennisbasis-rails/AC-3: feiten adr', () => {
  test('compacte-kennisbasis-rails/AC-3 het volgende nummer telt het archief mee, ook als dat het hoogste nummer heeft', () => {
    const f = maakRepo({ specs: [], mandaat: [], roadmap: [] });
    write(f.root, 'docs/adr/0050-actief.md', adr('0050', 'geaccepteerd'));
    write(f.root, 'docs/adr/archief/0090-oud.md', adr('0090', 'vervallen'));
    expect(feiten(f.root).volgende).toContain('0091 (template');
  });

  test('compacte-kennisbasis-rails/AC-3 het volgende nummer telt docs/adr/ mee, ook als het archief lager eindigt', () => {
    const f = maakRepo({ specs: [], mandaat: [], roadmap: [] });
    write(f.root, 'docs/adr/0090-actief.md', adr('0090', 'geaccepteerd'));
    write(f.root, 'docs/adr/archief/0050-oud.md', adr('0050', 'vervallen'));
    expect(feiten(f.root).volgende).toContain('0091 (template');
  });

  test('compacte-kennisbasis-rails/AC-3 de lijst toont standaard alleen docs/adr/, niet het archief', () => {
    const f = maakRepo({ specs: [], mandaat: [], roadmap: [] });
    write(f.root, 'docs/adr/0050-actief.md', adr('0050', 'geaccepteerd'));
    write(f.root, 'docs/adr/archief/0049-oud.md', adr('0049', 'geaccepteerd'));
    write(f.root, 'docs/adr/archief/0048-oud.md', adr('0048', 'vervangen door 0050'));
    const nummers = feiten(f.root).lijst.map(({ nummer }) => nummer);
    expect(nummers).toContain('0050');
    expect(nummers).not.toContain('0049');
    expect(nummers).not.toContain('0048');
  });
});

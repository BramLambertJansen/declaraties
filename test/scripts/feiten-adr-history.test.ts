import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { z } from 'zod';
import { commit, git, maakRepo, opruimen, write } from '../hooks/follow-up-kit';

afterEach(opruimen);
const script = path.resolve('scripts/kit/feiten.mjs');
const schema = z.object({ adr: z.object({ volgende: z.string(), lijst: z.array(z.object({ nummer: z.string() })) }) });
const fixture = () => maakRepo({ specs: [], mandaat: [], roadmap: [] });
const adr = '# 0070 — Historisch\n\nStatus: vervallen\n';

function facts(root: string) {
  const result = spawnSync(process.execPath, [script, 'adr', '--json'], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return schema.parse(JSON.parse(result.stdout)).adr;
}

test('feiten reserveert een verwijderd nummer zonder een fictief ADR in de lijst te tonen', () => {
  const f = fixture();
  write(f.root, 'docs/adr/0070-old.md', adr);
  commit(f.root);
  git(f.root, ['rm', 'docs/adr/0070-old.md']);
  commit(f.root);
  const result = facts(f.root);
  expect(result.volgende).toContain('0071 (template');
  expect(result.lijst.map(({ nummer }) => nummer)).not.toContain('0070');
});

test('feiten telt ook nummers in het archief mee', () => {
  const f = fixture();
  write(f.root, 'docs/adr/archief/0070-old.md', adr);
  expect(facts(f.root).volgende).toContain('0071 (template');
});

test('feiten vermijdt een nummer dat main na het aftakken al gebruikte', () => {
  const f = fixture();
  write(f.root, 'docs/adr/0070-main.md', adr);
  const main = commit(f.root);
  git(f.root, ['update-ref', 'refs/remotes/origin/main', main]);
  git(f.root, ['checkout', '--detach', f.base]);
  expect(facts(f.root).volgende).toContain('0071 (template');
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Leerpunt #396: tests maken tijdelijke mappen met mkdtemp(tmpdir()) en ruimen ze niet altijd op, zodat /tmp volloopt.
// Deze globalSetup geeft elke testrun één eigen hoofdmap onder de tmpdir van de aanroeper en zet TMPDIR daarop, vóór de
// workers starten: workers en hun kindprocessen maken hun mappen dus daaronder. De teardown verwijdert alleen die hoofdmap,
// ook als tests falen; de rest van /tmp blijft onaangeroerd. Getest in test/setup/tmp-root.test.ts.
export default function setup(): () => void {
  const vorige = process.env['TMPDIR'];
  const root = mkdtempSync(path.join(tmpdir(), 'vitest-run-'));
  process.env['TMPDIR'] = root;
  return () => {
    if (vorige === undefined) Reflect.deleteProperty(process.env, 'TMPDIR');
    else process.env['TMPDIR'] = vorige;
    rmSync(root, { recursive: true, force: true });
  };
}

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { catalogusFouten, componenten } from '../../scripts/kit/catalogus.mjs';

// De opdracht verandert de rail: broninventarisatie, renderpaden en geen uitzonderingen. De historische tests blijven
// bewijzen dat de echte repo groen is en dat ontbrekende voorbeelden worden geweigerd; fixtures bevatten nu echte code.
function repo(barrel: string, page: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'catalogus-'));
  mkdirSync(path.join(root, 'src/web/ui'), { recursive: true });
  mkdirSync(path.join(root, 'src/web/features/design-system'), { recursive: true });
  writeFileSync(path.join(root, 'src/web/ui/components.tsx'), barrel);
  writeFileSync(path.join(root, 'src/web/ui/index.ts'), "export * from './components.tsx';");
  writeFileSync(path.join(root, 'src/web/features/design-system/design-system-page.tsx'), page);
  return root;
}

test('de echte repo: elk ontdekt UI-component en elke variant heeft een bereikbaar voorbeeld', () => {
  expect(catalogusFouten()).toStrictEqual([]);
});

test('een component zonder voorbeeld faalt, ook als hij wel geëxporteerd is', () => {
  const root = repo(
    'export function Button() { return <button />; } export function Badge() { return <span />; }',
    "import { Button } from '../../ui/index.ts'; export function DesignSystemPage() { return <Button />; }",
  );
  expect(componenten(root).map(({ naam }) => naam)).toStrictEqual(['Button', 'Badge']);
  expect(catalogusFouten(root)).toStrictEqual([
    'Badge: geen bereikbaar voorbeeld op /design-system (src/web/ui/components.tsx)',
  ]);
});

test('historische uitzonderingen zijn vervallen: AsyncView vereist ook een bereikbaar voorbeeld', () => {
  const root = repo(
    'export function AsyncView() { return <p>Laden</p>; }',
    'export function DesignSystemPage() { return <div />; }',
  );
  expect(catalogusFouten(root)).toStrictEqual([
    'AsyncView: geen bereikbaar voorbeeld op /design-system (src/web/ui/components.tsx)',
  ]);
});

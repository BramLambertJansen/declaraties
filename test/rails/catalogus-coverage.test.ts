import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { catalogusFouten, componenten } from '../../scripts/kit/catalogus.mjs';

function fixture(component: string, page: string, barrel = '') {
  const root = mkdtempSync(path.join(tmpdir(), 'catalogus-coverage-'));
  const files = {
    'src/core/web/ui/badge.tsx': component,
    'src/web/ui/index.ts': barrel,
    'src/web/features/design-system/design-system-page.tsx': page,
  };
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  }
  return root;
}

const BADGE = 'export function Badge() { return <span>Badge</span>; }';
const IMPORT = "import { Badge } from '../../../core/web/ui/badge.tsx';\n";

test('een UI-component zonder barrel-export wordt toch ontdekt', () => {
  const root = fixture(BADGE, 'export function DesignSystemPage() { return <div />; }');
  expect(catalogusFouten(root)).toContainEqual(expect.stringContaining('Badge:'));
  expect(componenten(root)).toMatchObject([
    { naam: 'Badge', bron: 'src/core/web/ui/badge.tsx', publiek: true, importnamen: [] },
  ]);
});

test.each([
  'export function DesignSystemPage() { return <Section title="Badge" />; }',
  'export function DesignSystemPage() { return <div />; } // <Badge />',
  'function Unused() { return <Badge />; } export function DesignSystemPage() { return <div />; }',
  'export function DesignSystemPage() { return <div>{"<Badge />"}</div>; }',
  'export function DesignSystemPage() { function Unused() { return <Badge />; } return <div />; }',
  'export function DesignSystemPage() { const unused = <Badge />; return <div />; }',
  'export function DesignSystemPage() { return <div>{false && <Badge />}</div>; }',
])('een titel, commentaar, string of onbereikbaar voorbeeld telt niet: %s', (page) => {
  const root = fixture(BADGE, IMPORT + page, "export { Badge } from '#core/web/ui/badge.tsx';");
  expect(catalogusFouten(root)).toContainEqual(expect.stringContaining('Badge:'));
});

test('een bereikbaar voorbeeld met importalias en doorgegeven JSX telt', () => {
  const root = fixture(
    BADGE,
    "import { Badge as Example } from '../../../core/web/ui/badge.tsx'; function Demo() { return <Example />; } export function DesignSystemPage() { const preview = <Demo />; return <div>{preview}</div>; }",
    "export * from '#core/web/ui/badge.tsx';",
  );
  expect(catalogusFouten(root)).toStrictEqual([]);
});

test.each([
  'export const Badge = () => <span>Badge</span>;',
  'export default function Badge() { return <span>Badge</span>; }',
  'export default function() { return <span>Badge</span>; }',
  'export default () => <span>Badge</span>;',
  'export class Badge { render() { return <span>Badge</span>; } }',
])('functie- en arrowexports worden automatisch geïndexeerd: %s', (component) => {
  const root = fixture(component, 'export function DesignSystemPage() { return <div />; }');
  expect(catalogusFouten(root)).toContainEqual(expect.stringContaining('Badge:'));
});

test('een nieuw variantveld wordt herkend zonder vooraf bekende veldnaam', () => {
  const root = fixture(
    "type Emphasis = 'quiet' | 'strong'; export function Badge({ emphasis = 'quiet' }: { emphasis?: Emphasis }) { return <span>{emphasis}</span>; }",
    IMPORT + 'export function DesignSystemPage() { return <Badge />; }',
    "export { Badge as ReusableBadge } from '#core/web/ui/badge.tsx';",
  );
  expect(componenten(root)).toMatchObject([
    { naam: 'Badge', varianten: { emphasis: ['quiet', 'strong'] }, importnamen: ['ReusableBadge'] },
  ]);
  expect(catalogusFouten(root)).toContainEqual(expect.stringContaining('emphasis="strong"'));
});

test('publieke UI-hookmethoden vereisen een bereikbaar gebruiksvoorbeeld', () => {
  const root = fixture(
    BADGE +
      ' export function useNotification(): { success: () => void; error: () => void } { return { success() {}, error() {} }; }',
    IMPORT +
      "import { useNotification } from '../../../core/web/ui/badge.tsx'; export function DesignSystemPage() { const notice = useNotification(); return <Badge onClick={() => notice.success()} />; }",
    "export { Badge, useNotification } from '#core/web/ui/badge.tsx';",
  );
  expect(catalogusFouten(root)).toStrictEqual(['useNotification: bereikbaar voorbeeld voor .error() ontbreekt']);
});

test('alle varianten in echte voorbeelden maken de rail groen', () => {
  const root = fixture(
    "export function Badge({ tone = 'info' }: { tone?: 'info' | 'error' }) { return <span>{tone}</span>; }",
    IMPORT + 'export function DesignSystemPage() { return <div><Badge /><Badge tone="error" /></div>; }',
    "export { Badge } from '#core/web/ui/badge.tsx';",
  );
  expect(catalogusFouten(root)).toStrictEqual([]);
});

test('namespaced UI-elementen worden geïndexeerd met hun echte importpad', () => {
  const root = fixture(
    'export const Badge = { Label: () => <span>Badge</span> };',
    IMPORT + 'export function DesignSystemPage() { return <Badge.Label />; }',
    "export { Badge } from '#core/web/ui/badge.tsx';",
  );
  expect(componenten(root)).toMatchObject([{ naam: 'Badge.Label', importnamen: ['Badge.Label'] }]);
  expect(catalogusFouten(root)).toStrictEqual([]);
});

test('een ongebruikte class-methode maskeert geen ontbrekend voorbeeld', () => {
  const root = fixture(
    BADGE + ' export class Display { render() { return <div />; } static unused() { return <Badge />; } }',
    "import { Display } from '../../../core/web/ui/badge.tsx'; export function DesignSystemPage() { return <Display />; }",
    "export { Badge, Display } from '#core/web/ui/badge.tsx';",
  );
  expect(catalogusFouten(root)).toStrictEqual([
    'Badge: geen bereikbaar voorbeeld op /design-system (src/core/web/ui/badge.tsx)',
  ]);
});

test('een nieuwe componentvariant vereist een daadwerkelijk voorbeeld', () => {
  const root = fixture(
    "export function Badge({ tone = 'info' }: { tone?: 'info' | 'error' }) { return <span>{tone}</span>; }",
    IMPORT + 'export function DesignSystemPage() { return <Badge />; }',
    "export { Badge } from '#core/web/ui/badge.tsx';",
  );
  expect(catalogusFouten(root)).toContainEqual(expect.stringContaining('tone="error"'));
});

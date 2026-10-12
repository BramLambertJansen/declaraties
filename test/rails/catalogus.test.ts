import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { catalogusFouten, componenten } from '../../scripts/kit/catalogus.mjs';

// check:catalogus (framework §7): bewijst dat de check faalt op een component zonder voorbeeld en op een overbodige
// uitzondering, en groen is op de echte repo.
function repo(barrel: string, page: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'catalogus-'));
  mkdirSync(path.join(root, 'src/web/ui'), { recursive: true });
  mkdirSync(path.join(root, 'src/web/features/design-system'), { recursive: true });
  writeFileSync(path.join(root, 'src/web/ui/index.ts'), barrel);
  writeFileSync(path.join(root, 'src/web/features/design-system/design-system-page.tsx'), page);
  return root;
}

test('de echte repo: elk component in de catalogus of met een uitzondering', () => {
  expect(catalogusFouten()).toStrictEqual([]);
});

test('een component zonder voorbeeld en zonder uitzondering faalt', () => {
  const root = repo(
    "export { Button, type ButtonProps } from '#core/web/ui/button.tsx';\nexport { Badge } from './badge.tsx';\n" +
      "export { AsyncView } from '#core/web/ui/async-view.tsx';\nexport { ErrorTextsProvider, useErrorText } from '#core/web/ui/error-texts.tsx';\n" +
      "export { Toaster, ToastProvider, useToast } from '#core/web/ui/toast.tsx';\n" +
      "export { AppShell } from '#core/web/ui/app-shell.tsx';\nexport { ThemeToggle } from '#core/web/ui/theme-toggle.tsx';\nexport { CenteredCard } from '#core/web/ui/centered-card.tsx';\nexport { NavLink } from '#core/web/ui/nav-link.tsx';\nexport { Sidebar } from '#core/web/ui/sidebar.tsx';\nexport { Topbar } from '#core/web/ui/topbar.tsx';\n",
    '<Section title="Button"><Button>Opslaan</Button></Section>',
  );

  expect(componenten(root).map(({ naam }) => naam)).toStrictEqual([
    'Button',
    'Badge',
    'AsyncView',
    'ErrorTextsProvider',
    'Toaster',
    'ToastProvider',
    'AppShell',
    'ThemeToggle',
    'CenteredCard',
    'NavLink',
    'Sidebar',
    'Topbar',
  ]);
  expect(catalogusFouten(root)).toStrictEqual([
    'Badge: niet op /design-system (src/web/features/design-system/design-system-page.tsx) en geen uitzondering',
  ]);
});

test('een uitzondering voor een component dat nu wel in de catalogus staat (of niet meer bestaat), faalt', () => {
  const root = repo(
    "export { AppShell } from '#core/web/ui/app-shell.tsx';\nexport { ThemeToggle } from '#core/web/ui/theme-toggle.tsx';\nexport { CenteredCard } from '#core/web/ui/centered-card.tsx';\nexport { AsyncView } from '#core/web/ui/async-view.tsx';\nexport { NavLink } from '#core/web/ui/nav-link.tsx';\n" +
      "export { Sidebar } from '#core/web/ui/sidebar.tsx';\nexport { Topbar } from '#core/web/ui/topbar.tsx';\n" +
      "export { Toaster, ToastProvider, useToast } from '#core/web/ui/toast.tsx';\n",
    '<Section title="Laden"><AsyncView query={q}>{() => null}</AsyncView></Section>',
  );

  expect(catalogusFouten(root)).toStrictEqual([
    'AsyncView: uitzondering is niet meer nodig; haal hem weg uit scripts/kit/catalogus.mjs',
    'ErrorTextsProvider: uitzondering is niet meer nodig; haal hem weg uit scripts/kit/catalogus.mjs',
  ]);
});

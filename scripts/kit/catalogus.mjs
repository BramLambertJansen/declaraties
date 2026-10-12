// check:catalogus (framework §7): elk component uit de kit (src/web/ui/index.ts) staat op /design-system, of heeft hieronder
// een uitzondering met reden. De lijst laten groeien is een gate-wijziging (scripts/ is beschermd). Een uitzondering die niet
// meer nodig is (het component staat nu in de catalogus of bestaat niet meer), faalt ook: de lijst krimpt alleen.
// Ook de bron van `node scripts/kit/feiten.mjs componenten`.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BARREL = 'src/web/ui/index.ts';
const CATALOGUS = 'src/web/features/design-system/design-system-page.tsx';

/** @type {Readonly<Record<string, string>>} */
export const UITZONDERINGEN = {
  AppShell:
    'de catalogus staat zelf in de AppShell; een tweede zou een tweede main en navigatie "Hoofdmenu" geven (spec design-system, OV-5)',
  CenteredCard:
    'layoutblok voor een heel scherm met een eigen main en h1; binnen de AppShell zouden er twee zijn. Te zien op /login (besluit eigenaar 2026-10-10)',
  AsyncView: 'vraagt een echte query (useQuery alleen in queries.ts); in gebruik op /admin/accounts',
  ErrorTextsProvider: 'context zonder eigen weergave',
  Toaster:
    'staat in de AppShell om de catalogus heen; de toasts zijn te zien via de knoppen in de sectie Toast op /design-system',
  ToastProvider: 'context zonder eigen weergave',
  NavLink: 'staat in de Sidebar van de AppShell om de catalogus heen',
  Sidebar: 'staat in de AppShell om de catalogus heen; los zou er een tweede navigatie "Hoofdmenu" zijn',
  ThemeToggle:
    'staat in de topbalk van de AppShell om de catalogus heen; een tweede zou een tweede knop "Donker thema" met eigen staat geven (besluit eigenaar 2026-10-10)',
  Topbar: 'staat in de AppShell om de catalogus heen; los zou er een tweede knop "Profielmenu" zijn',
};

/**
 * Componenten (namen met een hoofdletter, geen types) die de kit exporteert, met hun bron.
 * @param {string} [root]
 * @returns {{ naam: string, bron: string }[]}
 */
export function componenten(root = '.') {
  const source = readFileSync(`${root}/${BARREL}`, 'utf8');
  return [...source.matchAll(/export \{([^}]*)\} from '([^']+)'/g)].flatMap(([, names = '', from = '']) =>
    names
      .split(',')
      .map((name) => name.trim())
      .filter((name) => /^[A-Z]/.test(name))
      .map((naam) => ({ naam, bron: from.replace(/^#core\//, 'src/core/').replace(/^\.\//, 'src/web/ui/') })),
  );
}

/**
 * @param {string} [root]
 * @returns {string[]}
 */
export function catalogusFouten(root = '.') {
  const page = readFileSync(`${root}/${CATALOGUS}`, 'utf8');
  const titles = [...page.matchAll(/<Section title="([^"]+)"/g)].map(([, title = '']) => title);
  /** @param {string} naam */
  const shown = (naam) =>
    new RegExp(`<${naam}[\\s>/]`).test(page) || titles.some((title) => new RegExp(`\\b${naam}\\b`).test(title));
  const names = componenten(root).map(({ naam }) => naam);
  return [
    ...names
      .filter((naam) => !shown(naam) && !(naam in UITZONDERINGEN))
      .map((naam) => `${naam}: niet op /design-system (${CATALOGUS}) en geen uitzondering`),
    ...Object.keys(UITZONDERINGEN)
      .filter((naam) => !names.includes(naam) || shown(naam))
      .map((naam) => `${naam}: uitzondering is niet meer nodig; haal hem weg uit scripts/kit/catalogus.mjs`),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fouten = catalogusFouten();
  if (fouten.length > 0) {
    console.error(`✗ check:catalogus\n${fouten.map((fout) => `  - ${fout}`).join('\n')}`);
    process.exit(1);
  }
  console.info(
    `✓ check:catalogus: ${String(componenten().length)} componenten in de catalogus of met een uitzondering`,
  );
}

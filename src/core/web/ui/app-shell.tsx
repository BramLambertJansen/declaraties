import { Menu } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';
import type { MenuItem } from './dropdown-menu.tsx';
import { Sidebar, type NavItem } from './sidebar.tsx';
import { Toaster } from './toast.tsx';
import { Topbar } from './topbar.tsx';

interface AppShellProps {
  readonly nav: readonly NavItem<string>[];
  readonly userName: string;
  readonly menuItems: readonly MenuItem[];
  // In de topbalk, vóór het profielmenu (bijv. <ThemeToggle />).
  readonly topbarActions?: ReactNode;
  // Verandert bij elke routewissel (bijv. het pad); de focus gaat dan naar de h1 van het nieuwe scherm (WCAG 2.4.3).
  readonly routeKey?: string;
  readonly children: ReactNode;
}

const MAIN_ID = 'inhoud';

// main en de h1 krijgen focus zonder focusring: niet interactief en niet met Tab bereikbaar (bewuste uitzondering op de
// regel "focusring nooit uit"); de schermlezer leest de plek voor.
// Na een routewissel (niet bij het eerste scherm) de focus naar de h1 van het nieuwe scherm. routeKey verandert pas als het
// nieuwe scherm gerenderd is (resolvedLocation), maar een scherm kan zijn h1 later tonen (lazy onderdeel, Suspense): dan
// wachten we tot er een h1 in main staat, en na HEADING_WAIT_MS zonder h1 gaat de focus naar main. Zo leest een
// schermlezer de nieuwe titel voor, en begint Tab bovenaan de inhoud. Na de render, zodat een sluitend menu zijn focus
// eerst teruggeeft.
const HEADING_WAIT_MS = 2000;

// Een zichtbare h1: tijdens het laden van een lazy route verbergt React Suspense het oude scherm met een inline
// display: none en blijft zijn h1 in de DOM; focus() op een verborgen element doet niets.
function isHiddenWithin(element: HTMLElement, main: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node !== null && node !== main; node = node.parentElement) {
    if (node.hidden || node.style.display === 'none') return true;
  }
  return false;
}

function focusVisibleHeading(main: HTMLElement): boolean {
  const heading = [...main.querySelectorAll<HTMLElement>('h1')].find((element) => !isHiddenWithin(element, main));
  heading?.focus();
  return heading !== undefined && document.activeElement === heading;
}

// Is de focus verloren (op body, of op een element dat net uit de DOM ging)? Dan mag de focus terug naar de h1; staat hij
// ergens anders, dan heeft de gebruiker hem verplaatst en blijven we eraf.
function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

function focusHeadingWhenPresent(main: HTMLElement): () => void {
  let focused = false;
  // Tot HEADING_WAIT_MS: een lazy scherm kan zijn h1 nog vervangen (opnieuw renderen), dan verdwijnt de gefocuste node.
  const attempt = () => {
    if (focused && !focusLost()) return;
    if (focusVisibleHeading(main)) focused = true;
  };
  const observer = new MutationObserver(attempt);
  const frame = requestAnimationFrame(() => {
    attempt();
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  });
  const timer = setTimeout(() => {
    stop();
    attempt();
    if (!focused) main.focus();
  }, HEADING_WAIT_MS);
  function stop() {
    cancelAnimationFrame(frame);
    observer.disconnect();
    clearTimeout(timer);
  }
  return stop;
}

function useFocusOnRouteChange(routeKey: string | undefined) {
  const mainRef = useRef<HTMLElement>(null);
  const previous = useRef(routeKey);
  useEffect(() => {
    if (previous.current === routeKey) return;
    previous.current = routeKey;
    const main = mainRef.current;
    return main === null ? undefined : focusHeadingWhenPresent(main);
  }, [routeKey]);
  return mainRef;
}

// Layout voor ingelogde schermen: sidebar links (vanaf md), topbar met profielmenu, inhoud. Op smalle schermen opent de
// menuknop dezelfde navigatie in een sheet die vanaf links over het scherm schuift. Breakpoints in CSS, geen matchMedia (framework §7).
export function AppShell({ nav, userName, menuItems, topbarActions, routeKey, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useFocusOnRouteChange(routeKey);
  const menuButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={uiTexts.openMenu}
      className="md:hidden"
      onClick={() => {
        setMenuOpen(true);
      }}
    >
      <Menu aria-hidden="true" />
    </Button>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      {/* Eerste Tab-stop (WCAG 2.4.1): langs sidebar en topbalk direct naar de inhoud. Alleen zichtbaar met focus. */}
      {/* Zonder fragment in de URL of extra history-stap: de klik zet zelf de focus op main. */}
      <a
        href={`#${MAIN_ID}`}
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only rounded-md bg-background text-sm text-foreground focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:inline-flex focus:min-h-control focus:items-center focus:px-3 focus:ring-2 focus:ring-ring"
      >
        {uiTexts.skipToContent}
      </a>
      <aside className="hidden border-e bg-sidebar md:block">
        <Sidebar items={nav} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <Topbar userName={userName} menuItems={menuItems} start={menuButton} actions={topbarActions} />
        <main ref={mainRef} id={MAIN_ID} tabIndex={-1} className="min-w-0 flex-1 p-4 focus:outline-none md:p-6">
          {children}
        </main>
      </div>
      <Dialog
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={uiTexts.mainMenu}
        closeLabel={uiTexts.close}
        variant="sheet"
      >
        {/* Een klik op een link sluit het menu; de router navigeert. */}
        <div
          onClickCapture={() => {
            setMenuOpen(false);
          }}
        >
          <Sidebar items={nav} />
        </div>
      </Dialog>
      <Toaster />
    </div>
  );
}

import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { DropdownMenu, type MenuItem } from './dropdown-menu.tsx';

// Initialen voor de profielknop: eerste letter van het eerste en het laatste woord.
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  const first = Array.from(words[0] ?? '')[0] ?? '?';
  const last = words.length > 1 ? (Array.from(words.at(-1) ?? '')[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

interface TopbarProps {
  readonly userName: string;
  readonly menuItems: readonly MenuItem[];
  // Links in de balk, bijv. de menuknop op smalle schermen (AppShell).
  readonly start?: ReactNode;
  // Rechts, vóór het profielmenu: bijv. de themaschakelaar (AppShell).
  readonly actions?: ReactNode;
}

// Profielmenu rechts (spec accountbeheer: knop met initialen, toegankelijke naam "Profielmenu").
export function Topbar({ userName, menuItems, start, actions }: TopbarProps) {
  return (
    <header className="flex min-h-14 items-center gap-2 border-b bg-background px-3">
      {start}
      <div className="ms-auto flex items-center gap-1">
        {actions}
        <DropdownMenu
          items={menuItems}
          trigger={
            <Button variant="ghost" size="icon" aria-label={uiTexts.profileMenu} className="rounded-full">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
              >
                {initials(userName)}
              </span>
            </Button>
          }
        />
      </div>
    </header>
  );
}

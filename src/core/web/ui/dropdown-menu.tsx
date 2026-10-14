import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from './cn.ts';

// Menu met toetsenbord (pijltjes, Enter, Esc; focus terug op de knop). modal={false}: de modale variant vergrendelt het
// scrollen met een inline <style>, wat de CSP blokkeert (framework §6).

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly busyLabel?: string;
}

interface DropdownMenuProps {
  readonly trigger: ReactNode;
  readonly items: readonly MenuItem[];
  readonly align?: 'start' | 'end';
}

export function DropdownMenu({ trigger, items, align = 'end' }: DropdownMenuProps) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={4}
          className="z-50 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              disabled={item.disabled ?? false}
              aria-disabled={item.busy || item.disabled || undefined}
              aria-busy={item.busy || undefined}
              onSelect={(event) => {
                if (item.busy || item.disabled) event.preventDefault();
                else item.onSelect();
              }}
              className={cn(
                'flex min-h-control cursor-default items-center rounded-sm px-3 text-sm outline-none select-none',
                'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 aria-busy:cursor-wait',
              )}
            >
              {item.busy ? (item.busyLabel ?? item.label) : item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

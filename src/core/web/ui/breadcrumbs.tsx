import { ChevronRight } from 'lucide-react';
import { uiTexts } from '../copy/ui.ts';
import { NavLink } from './nav-link.tsx';

export interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface BreadcrumbsProps {
  readonly items: readonly BreadcrumbItem[];
  readonly currentPage: string;
  readonly label?: string;
}

export function Breadcrumbs({ items, currentPage, label = uiTexts.breadcrumbs }: BreadcrumbsProps) {
  return (
    <nav aria-label={label}>
      <ol className="flex min-w-0 flex-wrap items-center gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 max-w-full items-center gap-2">
            <NavLink
              href={item.href}
              aria-current={undefined}
              className="min-w-0 break-words text-foreground underline underline-offset-4"
            >
              {item.label}
            </NavLink>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
          </li>
        ))}
        <li className="min-w-0 break-words" aria-current="page">
          {currentPage}
        </li>
      </ol>
    </nav>
  );
}

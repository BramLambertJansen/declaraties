import type { ReactNode } from 'react';
import { PageTitle } from './page-title.tsx';

// Titel van een scherm binnen de AppShell (de enige h1), met acties rechts; op smalle schermen eronder.
interface PageHeaderProps {
  readonly title: string;
  readonly actions?: ReactNode;
  // false: zet de paginatitel niet (alleen voor een voorbeeld naast de echte kop, zoals op /design-system).
  readonly documentTitle?: boolean;
  // Voorbeeld naast de echte kop: h3 in plaats van h1 en geen paginatitel. Los van documentTitle.
  readonly preview?: boolean;
}

export function PageHeader({ title, actions, documentTitle = true, preview = false }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <PageTitle
        title={title}
        documentTitle={documentTitle}
        preview={preview}
        className="text-2xl font-semibold tracking-tight"
      />
      {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

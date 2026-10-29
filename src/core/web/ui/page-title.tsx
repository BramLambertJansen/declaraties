import { useDocumentTitle } from '../lib/document-title.ts';
import { cn } from './cn.ts';

// De enige h1 van een scherm (PageHeader, CenteredCard, RouteError): zet ook de paginatitel. tabIndex -1 zodat de AppShell
// na een routewissel de focus hierheen kan zetten (WCAG 2.4.3). Bewuste uitzondering op "focusring nooit uit": de h1 is niet
// interactief en niet met Tab bereikbaar; de focus staat er alleen zodat een schermlezer de nieuwe titel voorleest.
interface PageTitleProps {
  readonly title: string;
  readonly className?: string;
  // false: geen paginatitel zetten (een voorbeeld op /design-system naast de echte kop).
  readonly documentTitle?: boolean;
  readonly preview?: boolean;
}

export function PageTitle({ title, className, documentTitle = true, preview = false }: PageTitleProps) {
  useDocumentTitle(documentTitle && !preview ? title : null);
  const Heading = preview ? 'h3' : 'h1';
  return (
    <Heading tabIndex={-1} className={cn('focus:outline-none', className)}>
      {title}
    </Heading>
  );
}

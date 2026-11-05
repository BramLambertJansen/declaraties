import { copy } from '#web/copy/ui.ts';
import { PageHeader } from '#web/ui/index.ts';

// Startpagina van een user (spec accountbeheer): alleen de titel.
export function HomePage() {
  return <PageHeader title={copy.home.title} />;
}

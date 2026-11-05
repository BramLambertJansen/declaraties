import { useId, type ReactNode } from 'react';
import { Heading } from '#core/web/ui/heading.tsx';
import { Text } from '#core/web/ui/text.tsx';

interface SectionProps {
  readonly title: string;
  readonly id?: string;
  readonly children: ReactNode;
  // Standaard een region met de titel als naam. Uit als de inhoud zelf al een region met die naam is (een Table met label):
  // anders staan er twee regio's met dezelfde naam naast elkaar.
  readonly landmark?: boolean;
  // Eén zin onder de titel, bijvoorbeeld waarvoor je een onderdeel gebruikt (spec designsystem-toolbox).
  readonly description?: string;
  // De inhoud in een omlijst vlak, zodat een voorbeeld niet als deel van de pagina leest (spec designsystem-toolbox).
  readonly framed?: boolean;
}

// Een sectie met een h2 als titel en toegankelijke naam (role region), bijvoorbeeld per onderdeel van de catalogus.
// Id via useId: een titel met spaties ("Form, Field en Input") als id leest aria-labelledby als meerdere id's.
export function Section({ title, children, landmark = true, id: targetId, description, framed = false }: SectionProps) {
  const id = useId();
  return (
    <section
      id={targetId}
      tabIndex={targetId === undefined ? undefined : -1}
      {...(landmark ? { 'aria-labelledby': id } : {})}
      className="flex flex-col gap-4"
    >
      {description === undefined ? (
        <Heading level={2} id={id}>
          {title}
        </Heading>
      ) : (
        <div className="flex flex-col gap-1">
          <Heading level={2} id={id}>
            {title}
          </Heading>
          <Text tone="muted">{description}</Text>
        </div>
      )}
      {framed ? <div className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4">{children}</div> : children}
    </section>
  );
}

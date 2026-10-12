import { useId, type ReactNode } from 'react';

interface SectionProps {
  readonly title: string;
  readonly children: ReactNode;
  // Standaard een region met de titel als naam. Uit als de inhoud zelf al een region met die naam is (een Table met label):
  // anders staan er twee regio's met dezelfde naam naast elkaar.
  readonly landmark?: boolean;
}

// Een sectie met een h2 als titel en toegankelijke naam (role region), bijvoorbeeld per onderdeel van de catalogus.
// Id via useId: een titel met spaties ("Form, Field en Input") als id leest aria-labelledby als meerdere id's.
export function Section({ title, children, landmark = true }: SectionProps) {
  const id = useId();
  return (
    <section {...(landmark ? { 'aria-labelledby': id } : {})} className="flex flex-col gap-4">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

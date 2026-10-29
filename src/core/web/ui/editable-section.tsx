import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button.tsx';

export interface EditableSectionProps {
  readonly title: string;
  readonly editing: boolean;
  readonly editLabel: string;
  readonly onEdit: () => void;
  readonly summary: ReactNode;
  readonly children: ReactNode;
}

export function EditableSection({ title, editing, editLabel, onEdit, summary, children }: EditableSectionProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const edit = useRef<HTMLButtonElement>(null);
  const previous = useRef(editing);
  useEffect(() => {
    if (previous.current === editing) return;
    previous.current = editing;
    if (editing) {
      heading.current?.focus();
      return;
    }
    // Sluit een bevestigingsdialoog in dezelfde render, dan zet die de focus nog terug (naar body). Daarom na die effects.
    const timer = setTimeout(() => {
      const active = document.activeElement;
      const ownFocus = active === heading.current || active === edit.current;
      if (active !== null && active !== document.body && !ownFocus) return;
      edit.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [editing]);
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {title}
        </h3>
        {editing ? null : (
          <Button ref={edit} variant="outline" onClick={onEdit}>
            {editLabel}
          </Button>
        )}
      </div>
      {editing ? children : summary}
    </section>
  );
}

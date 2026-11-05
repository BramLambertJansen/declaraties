import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { assert } from '#core/shared/assert.ts';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';

export interface GalleryItem {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly caption?: string;
  readonly description?: string;
}
export interface GalleryProps {
  readonly label: string;
  readonly items: readonly GalleryItem[];
  readonly unavailableText: string;
  readonly emptyContent?: ReactNode;
  readonly preview?: { readonly previewLabel: (item: GalleryItem) => string; readonly closeLabel: string };
}

function GalleryImage({
  item,
  unavailableText,
  enlarged = false,
}: {
  readonly item: GalleryItem;
  readonly unavailableText: string;
  readonly enlarged?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return failedSource === item.src ? (
    <p
      role="status"
      className="flex aspect-video items-center justify-center rounded-lg bg-muted p-4 text-muted-foreground"
    >
      {unavailableText}
    </p>
  ) : (
    <img
      src={item.src}
      alt={item.alt}
      loading="lazy"
      className={enlarged ? 'max-h-full w-full object-contain' : 'aspect-video w-full rounded-lg object-cover'}
      onError={() => {
        setFailedSource(item.src);
      }}
    />
  );
}

export function Gallery({ label, items, preview, unavailableText, emptyContent }: GalleryProps) {
  const ids = items.map((item) => item.id);
  assert(ids.every((id) => id !== '') && new Set(ids).size === ids.length, 'Gallery needs unique non-empty ids');
  const [selected, setSelected] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  const base = useId();
  const active = preview === undefined ? undefined : items.find((item) => item.id === selected);
  useLayoutEffect(() => {
    if (wasOpen.current && active === undefined) {
      setSelected(null);
    }
    wasOpen.current = active !== undefined;
  }, [active]);
  return (
    <div ref={root} role="group" tabIndex={-1} aria-label={label} className="min-w-0">
      {items.length === 0 ? (
        (emptyContent ?? <p>Geen resultaten.</p>)
      ) : (
        <ul aria-label={label} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <figure className="flex min-w-0 flex-col gap-2">
                <GalleryImage key={item.src} item={item} unavailableText={unavailableText} />
                {item.caption === undefined && item.description === undefined ? null : (
                  <figcaption className="break-words">
                    {item.caption === undefined ? null : <p className="font-medium">{item.caption}</p>}
                    {item.description === undefined ? null : (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </figcaption>
                )}
                {preview === undefined ? null : (
                  <Button
                    variant="outline"
                    className="max-w-full whitespace-normal"
                    aria-haspopup="dialog"
                    aria-controls={`${base}-preview`}
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setSelected(item.id);
                    }}
                  >
                    <span className="min-w-0 break-words">{preview.previewLabel(item)}</span>
                  </Button>
                )}
              </figure>
            </li>
          ))}
        </ul>
      )}
      <div id={`${base}-preview`}>
        <Dialog
          open={active !== undefined}
          title={active?.caption?.trim() || (active === undefined ? label : (preview?.previewLabel(active) ?? label))}
          closeLabel={preview?.closeLabel ?? 'Sluiten'}
          onOpenChange={(open) => {
            if (!open) {
              setSelected(null);
              // Dialog meldt ook de native close: pas dan is de gallery niet meer inert.
              const target = opener.current?.isConnected === true ? opener.current : root.current;
              target?.focus();
            }
          }}
        >
          {active === undefined ? null : (
            <figure className="flex max-h-96 min-h-0 flex-col gap-2 overflow-y-auto">
              <GalleryImage key={active.src} item={active} unavailableText={unavailableText} enlarged />
              {active.caption === undefined ? null : <figcaption className="break-words">{active.caption}</figcaption>}
            </figure>
          )}
        </Dialog>
      </div>
    </div>
  );
}

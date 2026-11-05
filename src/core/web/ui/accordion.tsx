import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { assert } from '#core/shared/assert.ts';
import { Button } from './button.tsx';

export interface AccordionItemData {
  readonly id: string;
  readonly title: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}
export interface AccordionProps {
  readonly items: readonly AccordionItemData[];
  readonly mode?: 'single' | 'multiple';
  readonly headingLevel?: 2 | 3 | 4;
  readonly value?: readonly string[];
  readonly defaultValue?: readonly string[];
  readonly onValueChange?: (value: readonly string[]) => void;
}

function AccordionItem({
  item,
  state,
}: {
  readonly item: AccordionItemData;
  readonly state: {
    readonly open: boolean;
    readonly base: string;
    readonly headingLevel: 2 | 3 | 4;
    readonly toggle: () => void;
  };
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const base = `${state.base}-${encodeURIComponent(item.id)}`;
  const Heading = state.headingLevel === 2 ? 'h2' : state.headingLevel === 3 ? 'h3' : 'h4';
  useLayoutEffect(() => {
    if (!state.open && focused.current) {
      focused.current = false;
      trigger.current?.focus();
    }
  }, [state.open]);
  return (
    <div className="min-w-0 border-b last:border-b-0">
      <Heading>
        <Button
          ref={trigger}
          id={`${base}-trigger`}
          variant="ghost"
          className="w-full justify-between whitespace-normal text-start break-words aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          aria-expanded={state.open}
          aria-controls={`${base}-panel`}
          aria-disabled={item.disabled || undefined}
          onClick={state.toggle}
        >
          <span className="min-w-0 break-words">{item.title}</span>
          <span aria-hidden="true">{state.open ? '−' : '+'}</span>
        </Button>
      </Heading>
      <div
        ref={panel}
        id={`${base}-panel`}
        aria-labelledby={`${base}-trigger`}
        hidden={!state.open}
        className="min-w-0 px-3 py-4 break-words"
        onFocusCapture={() => {
          focused.current = true;
        }}
        onBlurCapture={(event) => {
          if (state.open && (!(event.relatedTarget instanceof Node) || !panel.current?.contains(event.relatedTarget)))
            focused.current = false;
        }}
      >
        {item.content}
      </div>
    </div>
  );
}

export function Accordion({
  items,
  mode = 'single',
  headingLevel = 3,
  value,
  defaultValue = [],
  onValueChange,
}: AccordionProps) {
  const [local, setLocal] = useState<readonly string[]>(defaultValue);
  const open = value ?? local;
  const base = useId();
  assert(
    items.every((item) => item.id !== '') && new Set(items.map((item) => item.id)).size === items.length,
    'Accordion item ids must be unique and non-empty',
  );
  assert(mode !== 'single' || open.length <= 1, 'A single Accordion accepts at most one open item');
  const toggle = (item: AccordionItemData) => {
    if (item.disabled) return;
    const next = open.includes(item.id)
      ? open.filter((id) => id !== item.id)
      : mode === 'single'
        ? [item.id]
        : [...open, item.id];
    if (value === undefined) setLocal(next);
    onValueChange?.(next);
  };
  return (
    <div className="min-w-0 rounded-lg border">
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          item={item}
          state={{
            open: open.includes(item.id),
            base,
            headingLevel,
            toggle: () => {
              toggle(item);
            },
          }}
        />
      ))}
    </div>
  );
}

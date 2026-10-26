import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from 'react';
import { assert } from '#core/shared/assert.ts';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Input } from './input.tsx';
import { cn } from './cn.ts';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}
export type ComboboxClearProps =
  | { readonly clearable: true; readonly clearLabel: string }
  | { readonly clearable?: false; readonly clearLabel?: string };
export type ComboboxProps = Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'children' | 'type'> &
  ComboboxClearProps & {
    readonly value: string;
    readonly onValueChange: (value: string) => void;
    readonly options: readonly ComboboxOption[];
    readonly emptyText?: string | undefined;
    // Formulierreset kan dezelfde waarde opnieuw instellen; wis dan ook de lopende zoekactie.
    readonly resetKey?: number;
  };

function useCombobox(props: ComboboxProps) {
  const { value, options, onValueChange, ref, resetKey, clearable, clearLabel, emptyText, ...inputProps } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const previous = useRef([value, props.disabled, props.readOnly, resetKey]);
  const close = () => {
    setOpen(false);
    setSearch(null);
    setActive(null);
  };
  useImperativeHandle(ref, () => {
    assert(input.current !== null, 'Combobox input must be mounted');
    return input.current;
  });
  useEffect(() => {
    const next = [value, props.disabled, props.readOnly, resetKey];
    // Alleen wijzigingen sluiten; mount mag de al ontvangen focus behouden.
    if (next.every((item, index) => Object.is(item, previous.current[index]))) return;
    previous.current = next;
    close();
  }, [value, props.disabled, props.readOnly, resetKey]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
    };
  }, []);
  const query = search?.trim().toLocaleLowerCase('nl') ?? '';
  const filtered = options.filter((option) => option.label.toLocaleLowerCase('nl').includes(query));
  const enabled = filtered.filter((option) => !option.disabled);
  const locked = props.disabled === true || props.readOnly === true;
  const current = open && !locked ? enabled.find((option) => option.value === active) : undefined;
  const choose = (value: string) => {
    if (locked) return;
    onValueChange(value);
    close();
  };
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    props.onKeyDown?.(event);
    if (locked || event.defaultPrevented || composing.current || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key === 'Tab') close();
    if (event.key === 'Enter' && current !== undefined) {
      event.preventDefault();
      choose(current.value);
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
    const index = enabled.findIndex((option) => option.value === current?.value);
    const next =
      index < 0 ? (event.key === 'ArrowDown' ? 0 : enabled.length - 1) : index + (event.key === 'ArrowDown' ? 1 : -1);
    setActive(enabled[Math.max(0, Math.min(enabled.length - 1, next))]?.value ?? null);
  };
  return {
    inputProps,
    clearable,
    clearLabel,
    emptyText,
    open: open && !locked,
    setOpen,
    search,
    setSearch,
    active: current?.value,
    setActive,
    input,
    root,
    composing,
    filtered,
    close,
    choose,
    keyboard,
  };
}

type ComboboxState = ReturnType<typeof useCombobox>;

function ComboboxPopup({
  state,
  props,
  base,
}: {
  readonly state: ComboboxState;
  readonly props: ComboboxProps;
  readonly base: string;
}) {
  const label = props['aria-label'] ?? state.input.current?.labels?.[0]?.textContent ?? undefined;
  return (
    <div className="absolute start-0 top-full z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-md border bg-background p-1 text-foreground shadow-md">
      <ul id={`${base}-options`} role="listbox" aria-label={label} aria-labelledby={props['aria-labelledby']}>
        {state.filtered.map((option) => (
          <li
            key={option.value}
            id={`${base}-option-${encodeURIComponent(option.value)}`}
            role="option"
            aria-selected={option.value === props.value}
            aria-disabled={option.disabled || undefined}
            data-active={option.value === state.active}
            className="flex min-h-control cursor-pointer items-center rounded-sm px-3 py-2 text-sm break-words aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-selected:font-semibold data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
            onPointerDown={(event) => {
              event.preventDefault();
            }}
            onPointerMove={() => {
              if (!option.disabled) state.setActive(option.value);
            }}
            onClick={() => {
              if (!option.disabled) state.choose(option.value);
            }}
          >
            <span className="min-w-0 break-words">{option.label}</span>
          </li>
        ))}
      </ul>
      {state.filtered.length === 0 ? (
        <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
          {state.emptyText ?? uiTexts.empty}
        </p>
      ) : null}
    </div>
  );
}

export function Combobox(props: ComboboxProps) {
  assert(
    props.options.every((option) => option.value !== '') &&
      new Set(props.options.map((option) => option.value)).size === props.options.length,
    'Combobox option values must be unique and non-empty',
  );
  const base = useId();
  const id = props.id ?? base;
  const state = useCombobox(props);
  const activeId = state.active === undefined ? undefined : `${base}-option-${encodeURIComponent(state.active)}`;
  const selected = props.options.find((option) => option.value === props.value)?.label ?? '';
  useEffect(() => {
    if (activeId !== undefined) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);
  return (
    <div
      ref={state.root}
      className="relative flex min-w-0 flex-col gap-2"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) state.close();
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Input
          {...state.inputProps}
          className={cn('min-w-0 flex-1', props.className)}
          id={id}
          ref={state.input}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={state.open}
          aria-controls={state.open ? `${base}-options` : undefined}
          aria-activedescendant={activeId}
          value={state.search ?? selected}
          onKeyDown={state.keyboard}
          onFocus={(event) => {
            props.onFocus?.(event);
            if (!props.disabled && !props.readOnly) state.setOpen(true);
          }}
          onClick={(event) => {
            props.onClick?.(event);
            if (!props.disabled && !props.readOnly) state.setOpen(true);
          }}
          onChange={(event) => {
            if (props.disabled || props.readOnly) return;
            state.setSearch(event.currentTarget.value);
            state.setActive(null);
            state.setOpen(true);
          }}
          onCompositionStart={(event) => {
            state.composing.current = true;
            props.onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            state.composing.current = false;
            props.onCompositionEnd?.(event);
          }}
        />
        {state.clearable && props.value !== '' ? (
          <Button
            variant="outline"
            disabled={props.disabled || props.readOnly}
            aria-label={state.clearLabel}
            onClick={() => {
              state.choose('');
              state.input.current?.focus();
            }}
          >
            {state.clearLabel}
          </Button>
        ) : null}
      </div>
      {state.open ? <ComboboxPopup state={state} props={props} base={base} /> : null}
    </div>
  );
}

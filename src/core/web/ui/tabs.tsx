import { useId, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { assert } from '#core/shared/assert.ts';
import { Button } from './button.tsx';
import { cn } from './cn.ts';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}
type TabState =
  | { readonly value: string; readonly onValueChange: (id: string) => void; readonly defaultValue?: never }
  | { readonly value?: never; readonly onValueChange?: never; readonly defaultValue?: string };
export type TabsProps = TabState & { readonly label: string; readonly items: readonly TabItem[] };

function useTabs(props: TabsProps) {
  const root = useRef<HTMLDivElement>(null);
  const base = useId();
  const first = props.items.find((item) => item.disabled !== true)?.id;
  const [local, setLocal] = useState(props.defaultValue ?? first ?? '');
  const [roving, setRoving] = useState<string | undefined>(undefined);
  const previousItems = useRef(props.items);
  const tracked = useRef<HTMLElement | null>(null);
  const requested = props.value ?? local;
  const active = props.items.find((item) => item.id === requested && item.disabled !== true)?.id;
  const structural =
    props.value === undefined &&
    previousItems.current.some((item) => item.id === local && item.disabled !== true) &&
    active === undefined;
  const visible = structural ? first : active;
  const focusId = props.items.some((item) => item.id === roving && item.disabled !== true)
    ? roving
    : (visible ?? first);
  const trigger = (id: string) => `${base}-tab-${encodeURIComponent(id)}`;
  const panel = (id: string) => `${base}-panel-${encodeURIComponent(id)}`;
  useLayoutEffect(() => {
    if (structural) setLocal(first ?? '');
    previousItems.current = props.items;
    const focused = tracked.current;
    if (focused === null || (document.activeElement !== focused && document.activeElement !== document.body)) return;
    if (!focused.isConnected || focused.closest('[hidden]') !== null || focused.matches(':disabled')) {
      const restored = visible ?? first;
      const target = restored === undefined ? root.current : document.getElementById(trigger(restored));
      target?.focus();
      tracked.current = target;
    }
  });
  const activate = (id: string) => {
    if (props.value === undefined) setLocal(id);
    props.onValueChange?.(id);
  };
  const navigate = (event: KeyboardEvent, id: string) => {
    const enabled = props.items.filter((item) => item.disabled !== true);
    const index = enabled.findIndex((item) => item.id === id);
    const positions: ReadonlyMap<string, number> = new Map([
      ['ArrowLeft', (index - 1 + enabled.length) % enabled.length],
      ['ArrowRight', (index + 1) % enabled.length],
      ['Home', 0],
      ['End', enabled.length - 1],
    ]);
    const next = positions.get(event.key);
    if (next === undefined) return;
    event.preventDefault();
    const target = enabled[next];
    if (target === undefined) return;
    setRoving(target.id);
    const button = document.getElementById(trigger(target.id));
    button?.focus();
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  return { root, trigger, panel, visible, focusId, activate, navigate, tracked, setRoving };
}

export function Tabs(props: TabsProps) {
  const ids = props.items.map((item) => item.id);
  assert(ids.every((id) => id !== '') && new Set(ids).size === ids.length, 'Tabs need unique non-empty ids');
  const state = useTabs(props);
  return (
    <div
      ref={state.root}
      tabIndex={-1}
      className="min-w-0"
      onFocusCapture={(event) => {
        state.tracked.current = event.target;
      }}
      onBlurCapture={(event) => {
        const left = event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget);
        const released =
          event.relatedTarget === null &&
          event.target.isConnected &&
          event.target.closest('[hidden]') === null &&
          !event.target.matches(':disabled');
        if (left || released) state.tracked.current = null;
      }}
    >
      {props.items.length === 0 ? null : (
        <div role="tablist" aria-label={props.label} className="flex max-w-full gap-2 overflow-x-auto border-b py-2">
          {props.items.map((item) => (
            <Button
              key={item.id}
              id={state.trigger(item.id)}
              role="tab"
              variant="ghost"
              disabled={item.disabled}
              aria-selected={state.visible === item.id}
              aria-controls={state.panel(item.id)}
              tabIndex={state.focusId === item.id ? 0 : -1}
              className={cn('shrink-0', state.visible === item.id && 'bg-accent text-accent-foreground')}
              onFocus={() => {
                state.setRoving(item.id);
              }}
              onKeyDown={(event) => {
                state.navigate(event, item.id);
              }}
              onClick={() => {
                state.activate(item.id);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      {props.items.map((item) => (
        <div
          key={item.id}
          id={state.panel(item.id)}
          role="tabpanel"
          aria-labelledby={state.trigger(item.id)}
          hidden={state.visible !== item.id}
          ref={(panel) => {
            if (panel === null) return;
            const controls = panel.querySelectorAll<HTMLElement>(
              'button,input:not([type="hidden"]),select,textarea,a[href],[tabindex]',
            );
            const hasFocusPoint = [...controls].some(
              (control) =>
                control.tabIndex >= 0 && !control.matches(':disabled') && control.closest('[hidden],[inert]') === null,
            );
            panel.tabIndex = hasFocusPoint ? -1 : 0;
          }}
          className="py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

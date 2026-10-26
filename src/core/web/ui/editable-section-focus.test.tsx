import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Button } from './button.tsx';
import { EditableSection } from './editable-section.tsx';
import { Input } from './input.tsx';

function ControlledSection({ editing }: { readonly editing: boolean }) {
  return (
    <>
      <EditableSection
        title="Gegevens"
        editing={editing}
        editLabel="Bewerken"
        onEdit={vi.fn()}
        summary={<p>Samenvatting</p>}
      >
        <Input aria-label="Editorveld" />
        <Button>Opslaan</Button>
        <Button>Annuleren</Button>
      </EditableSection>
      <Input aria-label="Ander veld" />
      <Button>Andere actie</Button>
    </>
  );
}

function openSection() {
  const view = render(<ControlledSection editing={false} />);
  view.rerender(<ControlledSection editing />);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Gegevens' }));
  return view;
}

function flushFocusTimer() {
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test.each(['kop', 'Opslaan', 'Annuleren', 'verloren editorfocus'])(
  'normaal sluiten herstelt Bewerken-focus vanaf %s',
  (origin) => {
    const view = openSection();
    if (origin === 'Opslaan' || origin === 'Annuleren') {
      screen.getByRole('button', { name: origin }).focus();
    }
    if (origin === 'verloren editorfocus') {
      const editor = screen.getByRole('textbox', { name: 'Editorveld' });
      editor.focus();
      editor.blur();
      expect(document.activeElement).toBe(document.body);
    }
    view.rerender(<ControlledSection editing={false} />);
    flushFocusTimer();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bewerken' }));
  },
);

const otherControls = [
  { role: 'textbox', name: 'Ander veld' },
  { role: 'button', name: 'Andere actie' },
];

test.each(otherControls)('een late controlled sluitovergang behoudt focus op $name', ({ role, name }) => {
  const view = openSection();
  const chosenControl = screen.getByRole(role, { name });
  chosenControl.focus();
  expect(document.activeElement).toBe(chosenControl);
  view.rerender(<ControlledSection editing={false} />);
  flushFocusTimer();
  expect(document.activeElement).toBe(chosenControl);
});

test.each(otherControls)('focus naar $name vóór de sluittimer blijft behouden', ({ role, name }) => {
  const view = openSection();
  view.rerender(<ControlledSection editing={false} />);
  const chosenControl = screen.getByRole(role, { name });
  chosenControl.focus();
  expect(document.activeElement).toBe(chosenControl);
  flushFocusTimer();
  expect(document.activeElement).toBe(chosenControl);
});

test('heropenen ruimt een nog wachtende sluittimer op en behoudt de kopfocus', () => {
  const view = openSection();
  const baseline = vi.getTimerCount();
  view.rerender(<ControlledSection editing={false} />);
  expect(vi.getTimerCount()).toBe(baseline + 1);
  view.rerender(<ControlledSection editing />);
  expect(vi.getTimerCount()).toBe(baseline);
  flushFocusTimer();
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Gegevens' }));
});

test('unmount ruimt een nog wachtende sluittimer op', () => {
  const view = openSection();
  const baseline = vi.getTimerCount();
  view.rerender(<ControlledSection editing={false} />);
  expect(vi.getTimerCount()).toBe(baseline + 1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(baseline);
  flushFocusTimer();
  expect(document.activeElement).toBe(document.body);
});

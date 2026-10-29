import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';
import { Input } from './input.tsx';

// Alleen openen simuleren; de keuze van het focusdoel gebeurt in Dialog. Native modaliteit draait ook in de browser-CI.
const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterEach(cleanup);
afterAll(() => {
  if (original === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
});

test.each([
  <Input key="disabled" disabled aria-label="Overslaan" />,
  <Input key="hidden-input" type="hidden" />,
  <fieldset key="disabled-fieldset" disabled>
    <Input aria-label="Overslaan" />
  </fieldset>,
  <div key="hidden" hidden>
    <Input aria-label="Overslaan" />
  </div>,
  <div key="inert" inert>
    <Input aria-label="Overslaan" />
  </div>,
  <Button key="disabled-autofocus" data-autofocus="" disabled>
    Overslaan
  </Button>,
  <Button key="hidden-autofocus" data-autofocus="" hidden>
    Overslaan
  </Button>,
])('opent op het eerste bruikbare veld, voorbij kandidaat %#', (blocked) => {
  render(
    <Dialog open onOpenChange={() => undefined} title="Bewerken">
      {blocked}
      <Input aria-label="Naam" />
    </Dialog>,
  );

  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Naam' }));
});

test('een bruikbaar autofocusdoel na een geblokkeerd doel krijgt voorrang op het eerste veld', () => {
  render(
    <Dialog open onOpenChange={() => undefined} title="Bevestigen">
      <Button data-autofocus="" disabled>
        Overslaan
      </Button>
      <Input aria-label="Naam" />
      <Button data-autofocus="">Annuleren</Button>
    </Dialog>,
  );

  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuleren' }));
});

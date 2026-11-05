import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { Dialog } from './dialog.tsx';
import { Input } from './input.tsx';

// jsdom kent showModal niet; de stub opent de dialoog alleen (focus en modaliteit test de e2e in een echte browser).
const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});
afterAll(() => {
  if (original === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  else Object.defineProperty(HTMLDialogElement.prototype, 'showModal', original);
});

// Spec accountbeheer: een dialoog met een formulier opent met de focus op het eerste veld, niet op de sluitknop.
test('bij openen staat de focus op het eerste veld', () => {
  render(
    <Dialog open onOpenChange={() => undefined} title="Uitnodigen">
      <Input aria-label="Naam" />
      <Input aria-label="E-mailadres" />
    </Dialog>,
  );

  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Naam' }));
});

// Sheet (navigatie op smalle schermen): een klik op de verduisterde strook (doel: de <dialog> zelf) sluit hem, een klik erin niet.
test('sheet: een klik naast het paneel sluit, een klik erin niet', () => {
  const onOpenChange = vi.fn();
  render(
    <Dialog open onOpenChange={onOpenChange} title="Hoofdmenu" variant="sheet">
      <p>Inhoud</p>
    </Dialog>,
  );

  fireEvent.click(screen.getByText('Inhoud'));
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('dialog', { name: 'Hoofdmenu' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

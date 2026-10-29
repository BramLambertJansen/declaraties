import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { Gallery } from './gallery.tsx';

const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterAll(() => {
  for (const [key, descriptor] of [
    ['showModal', show],
    ['close', close],
  ] satisfies readonly (readonly [string, PropertyDescriptor | undefined])[]) {
    if (descriptor === undefined) Reflect.deleteProperty(HTMLDialogElement.prototype, key);
    else Object.defineProperty(HTMLDialogElement.prototype, key, descriptor);
  }
});
afterEach(cleanup);
const item = { id: '__proto__', src: '/land.svg', alt: 'Bergen', caption: 'Landschap' };
const base = { label: 'Foto’s', items: [item], unavailableText: 'Niet beschikbaar' };
const preview = { previewLabel: () => 'Bekijken', closeLabel: 'Sluiten' };

test('fout behoudt caption en nieuwe src probeert opnieuw; lege inhoud is configureerbaar', () => {
  const { rerender } = render(<Gallery {...base} />);
  expect(screen.getByRole('list', { name: 'Foto’s' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Bergen' }).getAttribute('loading')).toBe('lazy');
  fireEvent.error(screen.getByRole('img', { name: 'Bergen' }));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Niet beschikbaar')).toBeTruthy();
  expect(screen.getByText('Landschap')).toBeTruthy();
  rerender(<Gallery {...base} items={[{ ...item, src: '/nieuw.svg' }]} />);
  expect(screen.getByRole('img', { name: 'Bergen' }).getAttribute('src')).toBe('/nieuw.svg');
  rerender(<Gallery {...base} items={[]} emptyContent="Lege galerij" />);
  expect(screen.getByText('Lege galerij')).toBeTruthy();
});

test('preview sluit met cancel en herstelt opener; verwijderen focust galerij', () => {
  const { rerender } = render(<Gallery {...base} preview={preview} />);
  const opener = screen.getByRole('button', { name: 'Bekijken' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent(
    screen.getByRole('dialog', { name: 'Landschap' }),
    new Event('cancel', { bubbles: true, cancelable: true }),
  );
  // De browser volgt een niet-geannuleerd cancel-event op met close.
  fireEvent(screen.getByRole('dialog'), new Event('close'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  rerender(<Gallery {...base} items={[]} preview={preview} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Foto’s');
});

test('decoratieve preview zonder caption heeft een naam en ongeldige ids falen', () => {
  const { unmount } = render(
    <Gallery {...base} items={[{ id: 'decor', src: '/decor.svg', alt: '' }]} preview={preview} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bekijken' }));
  expect(screen.getByRole('dialog', { name: 'Bekijken' })).toBeTruthy();
  unmount();
  expect(() => render(<Gallery {...base} items={[item, item]} />)).toThrow();
  expect(() => render(<Gallery {...base} items={[{ ...item, id: '' }]} />)).toThrow();
});

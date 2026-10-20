import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CopyButton } from './copy-button.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function clipboard(writeText: (value: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
}

test('kopieert uitsluitend na activering, blokkeert dubbele acties en meldt pas succes na afronding', async () => {
  let finish: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const write = vi.fn(() => pending);
  clipboard(write);
  render(<CopyButton value={'precies\ndeze tekst'} />);
  expect(write).not.toHaveBeenCalled();
  const button = screen.getByRole('button', { name: 'Kopiëren' });
  button.focus();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(write).toHaveBeenCalledExactlyOnceWith('precies\ndeze tekst');
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('status').textContent).toBe('');
  await act(async () => {
    finish();
    await pending;
  });
  expect(screen.getByRole('status').textContent).toBe('Gekopieerd.');
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute('type')).toBe('button');
});

test('geweigerd klembord geeft fout en kan opnieuw proberen', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
  clipboard(write);
  render(<CopyButton value="tekst" />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Kopiëren is niet gelukt. Selecteer en kopieer de tekst zelf.');
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Gekopieerd.');
  expect(screen.getByRole('alert').textContent).toBe('');
});

test('ontbrekende Clipboard API meldt een fout; disabled voert niets uit', async () => {
  vi.stubGlobal('navigator', {});
  const view = render(<CopyButton value="tekst" disabled />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('alert').textContent).toBe('');
  view.rerender(<CopyButton value="tekst" />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('Kopiëren is niet gelukt. Selecteer en kopieer de tekst zelf.');
});

test('een oude afgeronde kopie toont geen succes bij een inmiddels gewijzigde waarde', async () => {
  let finish: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  clipboard(() => pending);
  const view = render(<CopyButton value="oud" />);
  fireEvent.click(screen.getByRole('button'));
  view.rerender(<CopyButton value="nieuw" />);
  await act(async () => {
    finish();
    await pending;
  });
  expect(screen.getByRole('status').textContent).toBe('');
});

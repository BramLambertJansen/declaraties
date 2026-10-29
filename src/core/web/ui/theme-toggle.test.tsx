import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { applyStoredTheme } from '../lib/theme.ts';
import { ThemeToggle } from './theme-toggle.tsx';

// Themaschakelaar (besluit eigenaar 2026-10-10): wisselt [data-theme] op <html>, onthoudt de keuze in deze browser.
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
  vi.restoreAllMocks();
});

test('klikken zet donker aan en weer uit; de keuze blijft bewaard', () => {
  render(<ThemeToggle />);
  const toggle = screen.getByRole('button', { name: 'Donker thema' });
  expect(toggle.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(toggle);
  expect([document.documentElement.dataset['theme'], toggle.getAttribute('aria-pressed')]).toStrictEqual([
    'dark',
    'true',
  ]);
  expect(localStorage.getItem('thema')).toBe('dark');

  fireEvent.click(toggle);
  expect([document.documentElement.dataset['theme'], localStorage.getItem('thema')]).toStrictEqual(['light', 'light']);
});

test('bij opstarten komt het bewaarde thema terug; zonder keuze licht', () => {
  applyStoredTheme();
  expect(document.documentElement.dataset['theme']).toBe('light');

  localStorage.setItem('thema', 'dark');
  applyStoredTheme();
  expect(document.documentElement.dataset['theme']).toBe('dark');
  render(<ThemeToggle />);
  expect(screen.getByRole('button', { name: 'Donker thema' }).getAttribute('aria-pressed')).toBe('true');
});

test('zonder bruikbare localStorage (privévenster) werkt de schakelaar nog, alleen niet bewaard', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  render(<ThemeToggle />);

  fireEvent.click(screen.getByRole('button', { name: 'Donker thema' }));
  expect(document.documentElement.dataset['theme']).toBe('dark');
});

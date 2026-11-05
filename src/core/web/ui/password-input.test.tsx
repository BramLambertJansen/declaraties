import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PasswordInput } from './password-input.tsx';

afterEach(cleanup);

test('tonen en verbergen behoudt hetzelfde veld, ref, waarde, autocomplete en toegankelijke koppeling', () => {
  const ref = createRef<HTMLInputElement>();
  const blur = vi.fn();
  render(
    <PasswordInput
      ref={ref}
      aria-label="Wachtwoord"
      defaultValue="geheim"
      autoComplete="current-password"
      onBlur={blur}
      aria-invalid
      aria-describedby="error"
    />,
  );
  const input = screen.getByLabelText('Wachtwoord');
  const toggle = screen.getByRole('button', { name: 'Wachtwoord tonen' });
  expect(ref.current).toBe(input);
  expect(input.getAttribute('type')).toBe('password');
  expect(toggle.getAttribute('aria-controls')).toBe(input.id);
  expect(toggle.getAttribute('type')).toBe('button');
  fireEvent.click(toggle);
  expect(screen.getByLabelText('Wachtwoord')).toBe(input);
  expect(input.getAttribute('type')).toBe('text');
  expect(ref.current?.value).toBe('geheim');
  expect(input.getAttribute('autocomplete')).toBe('current-password');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe('error');
  expect(input.getAttribute('autocapitalize')).toBe('none');
  expect(input.getAttribute('spellcheck')).toBe('false');
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  fireEvent.blur(input);
  expect(blur).toHaveBeenCalledOnce();
  fireEvent.click(toggle);
  expect(input.getAttribute('type')).toBe('password');
});

test('instanties krijgen unieke ids en alleen hun eigen zichtbaarheid; disabled geldt ook voor de toggle', () => {
  render(
    <>
      <PasswordInput aria-label="Eerste" />
      <PasswordInput aria-label="Tweede" disabled />
    </>,
  );
  const first = screen.getByLabelText('Eerste');
  const second = screen.getByLabelText('Tweede');
  expect(first.id).not.toBe(second.id);
  const toggles = screen.getAllByRole('button');
  expect(toggles[1]?.hasAttribute('disabled')).toBe(true);
  expect(second.hasAttribute('disabled')).toBe(true);
  fireEvent.click(toggles[0] ?? first);
  expect(first.getAttribute('type')).toBe('text');
  expect(second.getAttribute('type')).toBe('password');
});

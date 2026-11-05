import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Button } from './button.tsx';

afterEach(cleanup);

// ui-kit-basics/AC-8
test('AC-8: busy houdt focus, blokkeert click/Enter/Space en herstelt na een fout', () => {
  const action = vi.fn();
  const key = vi.fn();
  const view = render(
    <Button onClick={action} onKeyDown={key}>
      Versturen
    </Button>,
  );
  const button = screen.getByRole('button', { name: 'Versturen' });
  button.focus();
  fireEvent.click(button);
  expect(action).toHaveBeenCalledTimes(1);
  view.rerender(
    <Button busy busyLabel="Bezig…" onClick={action} onKeyDown={key}>
      Versturen
    </Button>,
  );
  expect(screen.getByRole('button', { name: 'Bezig…' })).toBe(button);
  expect(document.activeElement).toBe(button);
  expect(button.hasAttribute('disabled')).toBe(false);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(fireEvent.click(button)).toBe(false);
  expect(fireEvent.click(button)).toBe(false);
  expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(false);
  expect(fireEvent.keyDown(button, { key: ' ' })).toBe(false);
  expect(action).toHaveBeenCalledTimes(1);
  expect(key).not.toHaveBeenCalled();
  view.rerender(<Button onClick={action}>Versturen</Button>);
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(action).toHaveBeenCalledTimes(2);
});

// ui-kit-basics/AC-8
test('AC-8: busy asChild bewaart het linkelement en weigert kindactie en navigatie', () => {
  const childAction = vi.fn();
  const parentAction = vi.fn();
  const view = render(
    <Button asChild onClick={parentAction}>
      <a href="/accounts" onClick={childAction}>
        Accounts
      </a>
    </Button>,
  );
  const link = screen.getByRole('link', { name: 'Accounts' });
  link.focus();
  view.rerender(
    <Button asChild busy busyLabel="Bezig…" onClick={parentAction}>
      <a href="/accounts" onClick={childAction}>
        Accounts
      </a>
    </Button>,
  );
  expect(screen.getByRole('link', { name: 'Bezig…' })).toBe(link);
  expect(link.textContent).toBe('Bezig…');
  expect(document.activeElement).toBe(link);
  expect(fireEvent.click(link)).toBe(false);
  expect(childAction).not.toHaveBeenCalled();
  expect(parentAction).not.toHaveBeenCalled();
  expect(link.getAttribute('type')).toBeNull();
});

test('busy pictogramknop krijgt de aangeleverde naam, native disabled blijft bestaan', () => {
  render(
    <Button size="icon" busy busyLabel="Bezig…" aria-label="Meldingen" disabled>
      <span aria-hidden>!</span>
    </Button>,
  );
  expect(screen.getByRole('button', { name: 'Bezig…' }).hasAttribute('disabled')).toBe(true);
});

test('busy submit voorkomt native submit, na herstel werkt het weer', () => {
  const submit = vi.fn((event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
  });
  const view = render(
    <form onSubmit={submit}>
      <Button type="submit" busy busyLabel="Bezig…">
        Versturen
      </Button>
    </form>,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(submit).not.toHaveBeenCalled();
  view.rerender(
    <form onSubmit={submit}>
      <Button type="submit">Versturen</Button>
    </form>,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(submit).toHaveBeenCalledTimes(1);
});

test('busy asChild blokkeert ook capturehandlers en bewaakt de busy-naam boven kindprops', () => {
  const capture = vi.fn();
  render(
    <Button asChild busy busyLabel="Bezig…">
      <a
        href="/accounts"
        onClickCapture={capture}
        onKeyDownCapture={capture}
        aria-label="Accounts"
        aria-disabled={false}
        aria-busy={false}
      >
        Accounts
      </a>
    </Button>,
  );
  const link = screen.getByRole('link', { name: 'Bezig…' });
  expect(fireEvent.click(link)).toBe(false);
  expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(false);
  expect(capture).not.toHaveBeenCalled();
  expect(link.getAttribute('aria-disabled')).toBe('true');
  expect(link.getAttribute('aria-busy')).toBe('true');
});

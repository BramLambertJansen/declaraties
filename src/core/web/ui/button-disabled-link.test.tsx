import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Button } from './button.tsx';

afterEach(cleanup);

function activate(link: HTMLElement, activation: string) {
  if (activation === 'click') return fireEvent.click(link);
  if (activation === 'auxclick') {
    return fireEvent(link, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
  }
  return fireEvent.keyDown(link, { key: activation });
}

describe('Button disabled asChild', () => {
  test.each(['click', 'auxclick', 'Enter', ' '])('disabled weigert %s vóór parent- en kindhandlers', (activation) => {
    const parentCapture = vi.fn();
    const parentAction = vi.fn();
    const childCapture = vi.fn();
    const childAction = vi.fn();
    render(
      <Button
        asChild
        disabled
        onClick={parentAction}
        onClickCapture={parentCapture}
        onKeyDown={parentAction}
        onKeyDownCapture={parentCapture}
        onAuxClick={parentAction}
        onAuxClickCapture={parentCapture}
      >
        <a
          href="#accounts"
          onClick={childAction}
          onClickCapture={childCapture}
          onKeyDown={childAction}
          onKeyDownCapture={childCapture}
          onAuxClick={childAction}
          onAuxClickCapture={childCapture}
        >
          Accounts
        </a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Accounts' });
    const allowed = activate(link, activation);

    expect.soft(allowed).toBe(false);
    expect.soft(parentCapture).not.toHaveBeenCalled();
    expect.soft(parentAction).not.toHaveBeenCalled();
    expect.soft(childCapture).not.toHaveBeenCalled();
    expect.soft(childAction).not.toHaveBeenCalled();
  });

  test('disabled is toegankelijk herkenbaar, ook als het kind aria-disabled=false meegeeft', () => {
    render(
      <Button asChild disabled>
        <a href="#accounts" aria-disabled={false} aria-label="Accounts beheren">
          Accounts
        </a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Accounts beheren' });

    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('href')).toBe('#accounts');
    expect(link.textContent).toBe('Accounts');
  });

  test.each(['disabled', 'busy'])('%s bewaart de naam op Button bij een pictogramlink', (state) => {
    render(
      <Button asChild disabled={state === 'disabled'} busy={state === 'busy'} aria-label="Accounts beheren">
        <a href="#accounts">
          <span aria-hidden>icoon</span>
        </a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Accounts beheren' });
    expect(link.getAttribute('href')).toBe('#accounts');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(fireEvent.click(link)).toBe(false);
  });

  test.each(['disabled', 'busy'])('%s bewaart de gewone voorrang van de kindnaam op de Button-naam', (state) => {
    render(
      <Button asChild disabled={state === 'disabled'} busy={state === 'busy'} aria-label="Accounts beheren">
        <a href="#accounts" aria-label="Account openen">
          <span aria-hidden>icoon</span>
        </a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Account openen' });
    expect(link.getAttribute('href')).toBe('#accounts');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(fireEvent.click(link)).toBe(false);
  });

  test('expliciet busyLabel gaat vóór de naam op Button en kind', () => {
    render(
      <Button asChild disabled busy busyLabel="Bezig…" aria-label="Accounts beheren">
        <a href="#accounts" aria-label="Account openen">
          <span aria-hidden>icoon</span>
        </a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Bezig…' });
    expect(link.textContent).toBe('Bezig…');
    expect(link.getAttribute('href')).toBe('#accounts');
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(fireEvent.click(link)).toBe(false);
  });

  test('disabled bewaart een op Button aangeleverde aria-busy-toestand', () => {
    render(
      <Button asChild disabled aria-busy>
        <a href="#accounts">Accounts</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Accounts' });
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.textContent).toBe('Accounts');
  });

  test('disabled bewaart de gewone voorrang van aria-busy op het kind', () => {
    render(
      <Button asChild disabled aria-busy>
        <a href="#accounts" aria-busy={false}>
          Accounts
        </a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Accounts' });
    expect(link.getAttribute('aria-busy')).toBe('false');
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.textContent).toBe('Accounts');
  });

  test('na disabled werken parent- en kindhandlers weer met behoud van link en label', () => {
    const parentCapture = vi.fn();
    const parentAction = vi.fn();
    const childCapture = vi.fn();
    const childAction = vi.fn();
    const content = (
      <a
        href="#accounts"
        aria-label="Accounts beheren"
        onClick={childAction}
        onClickCapture={childCapture}
        onKeyDown={childAction}
        onKeyDownCapture={childCapture}
        onAuxClick={childAction}
        onAuxClickCapture={childCapture}
      >
        Accounts
      </a>
    );
    const view = render(
      <Button asChild disabled>
        {content}
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Accounts beheren' });
    view.rerender(
      <Button
        asChild
        disabled={false}
        onClick={parentAction}
        onClickCapture={parentCapture}
        onKeyDown={parentAction}
        onKeyDownCapture={parentCapture}
        onAuxClick={parentAction}
        onAuxClickCapture={parentCapture}
      >
        {content}
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Accounts beheren' })).toBe(link);
    expect(link.getAttribute('href')).toBe('#accounts');
    expect(link.textContent).toBe('Accounts');
    expect(link.getAttribute('type')).toBeNull();
    expect(link.getAttribute('aria-disabled')).not.toBe('true');
    expect(fireEvent.click(link)).toBe(true);
    expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(link, { key: ' ' })).toBe(true);
    expect(activate(link, 'auxclick')).toBe(true);
    expect(parentCapture).toHaveBeenCalledTimes(4);
    expect(parentAction).toHaveBeenCalledTimes(4);
    expect(childCapture).toHaveBeenCalledTimes(4);
    expect(childAction).toHaveBeenCalledTimes(4);
  });

  test('busy asChild weigert de middelste muisknop vóór parent- en kindhandlers', () => {
    const parentCapture = vi.fn();
    const parentAction = vi.fn();
    const childCapture = vi.fn();
    const childAction = vi.fn();
    render(
      <Button asChild busy onAuxClick={parentAction} onAuxClickCapture={parentCapture}>
        <a href="#accounts" onAuxClick={childAction} onAuxClickCapture={childCapture}>
          Accounts
        </a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Accounts' });

    expect.soft(activate(link, 'auxclick')).toBe(false);
    expect.soft(parentCapture).not.toHaveBeenCalled();
    expect.soft(parentAction).not.toHaveBeenCalled();
    expect.soft(childCapture).not.toHaveBeenCalled();
    expect.soft(childAction).not.toHaveBeenCalled();
  });

  test('busy blijft blokkeren nadat disabled is opgeheven en herstelt daarna de oorspronkelijke naam', () => {
    const action = vi.fn();
    const content = (
      <a href="#accounts" onClick={action} aria-label="Accounts beheren">
        Accounts
      </a>
    );
    const view = render(
      <Button asChild disabled busy busyLabel="Bezig…">
        {content}
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Bezig…' });
    view.rerender(
      <Button asChild disabled={false} busy busyLabel="Bezig…">
        {content}
      </Button>,
    );

    expect(screen.getByRole('link', { name: 'Bezig…' })).toBe(link);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(fireEvent.click(link)).toBe(false);
    expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(link, { key: ' ' })).toBe(false);
    expect(action).not.toHaveBeenCalled();
    view.rerender(<Button asChild>{content}</Button>);
    expect(screen.getByRole('link', { name: 'Accounts beheren' })).toBe(link);
    expect(link.textContent).toBe('Accounts');
    expect(link.getAttribute('href')).toBe('#accounts');
    expect(link.getAttribute('aria-disabled')).not.toBe('true');
    expect(link.getAttribute('aria-busy')).not.toBe('true');
    expect(fireEvent.click(link)).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

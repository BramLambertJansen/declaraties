import { describe, expect, test } from 'vitest';
import { redirectToAppOrigin } from '../../vite.config.ts';

// De dev-server stuurt een pagina op een ander adres door naar APP_ORIGIN; anders weigert de CSRF-controle elke POST.
const APP_ORIGIN = 'http://localhost:5173';

describe('redirectToAppOrigin', () => {
  test('127.0.0.1 (de link die Vite toont) → dezelfde pagina op APP_ORIGIN', () => {
    expect(redirectToAppOrigin({ method: 'GET', host: '127.0.0.1:5173', url: '/admin/accounts?x=1' }, APP_ORIGIN)).toBe(
      'http://localhost:5173/admin/accounts?x=1',
    );
  });

  test('al op APP_ORIGIN: geen redirect', () => {
    expect(redirectToAppOrigin({ method: 'GET', host: 'localhost:5173', url: '/' }, APP_ORIGIN)).toBeNull();
  });

  test('geen GET (een POST blijft geweigerd, niet stil doorgestuurd) of geen Host: geen redirect', () => {
    expect(redirectToAppOrigin({ method: 'POST', host: '127.0.0.1:5173', url: '/api/x' }, APP_ORIGIN)).toBeNull();
    expect(redirectToAppOrigin({ method: 'GET', url: '/' }, APP_ORIGIN)).toBeNull();
  });
});

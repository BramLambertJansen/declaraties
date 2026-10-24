import { beforeEach, expect, test, vi } from 'vitest';

const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail: vi.fn() })));
vi.mock('nodemailer', () => ({ createTransport }));

import { SMTP_TIMEOUTS, createSmtpMailer } from './smtp.ts';

beforeEach(() => {
  createTransport.mockClear();
});

test('de SMTP-timeouts zijn positieve, eindige getallen', () => {
  expect(SMTP_TIMEOUTS).toBeDefined();
  const timeouts: Readonly<Record<string, number>> = SMTP_TIMEOUTS;
  expect(Object.keys(timeouts).toSorted()).toStrictEqual(['connectionTimeout', 'greetingTimeout', 'socketTimeout']);
  for (const value of Object.values(timeouts)) expect(Number.isFinite(value) && value > 0).toBe(true);
});

test('createSmtpMailer geeft de timeouts door aan nodemailer', () => {
  createSmtpMailer('smtp://localhost:1025', 'app@example.test');
  expect(createTransport).toHaveBeenCalledWith('smtp://localhost:1025', SMTP_TIMEOUTS);
});

import type { Cents } from '../../shared/money.ts';

// Eén formatter per soort waarde (framework §6). De UI is Nederlands; tijd staat als ISO-string in de API en wordt hier
// in de tijdzone van de gebruikers getoond.
const LOCALE = 'nl-NL';
const TIME_ZONE = 'Europe/Amsterdam';

const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
const euro = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
const number = new Intl.NumberFormat(LOCALE);

function parse(iso: string): Date {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) throw new Error(`format: geen geldige ISO-tijd: '${iso}'`);
  return value;
}

export const format = {
  date: (iso: string): string => date.format(parse(iso)),
  dateTime: (iso: string): string => dateTime.format(parse(iso)),
  cents: (amount: Cents): string => euro.format(amount / 100),
  number: (value: number): string => number.format(value),
};

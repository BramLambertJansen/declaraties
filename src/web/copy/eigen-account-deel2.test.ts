import { expect, test } from 'vitest';
import { copy } from './ui.ts';

// Spec eigen-account, deel 2: de teksten van Sessies, E-mailadres en /email-bevestigen letterlijk uit de spec. Gelezen met
// Reflect.get, zodat dit compileert voordat de sleutels bestaan; de developer volgt deze namen in src/web/copy/ui.ts.
function read(path: readonly string[]): unknown {
  let current: unknown = copy;
  for (const key of path)
    current = typeof current === 'object' && current !== null ? Reflect.get(current, key) : undefined;
  return current;
}

function call(path: readonly string[], argument: string): unknown {
  const value = read(path);
  return typeof value === 'function' ? Reflect.apply(value, undefined, [argument]) : undefined;
}

test('Sessies: kop, kolommen, labels en acties', () => {
  expect(read(['account', 'sessions'])).toMatchObject({
    title: 'Sessies',
    device: 'Apparaat',
    createdAt: 'Ingelogd op',
    lastActive: 'Laatst actief',
    current: 'Dit apparaat',
    revoke: 'Beëindigen',
    revokeOthers: 'Alle andere sessies beëindigen',
    unknownDevice: 'Onbekend apparaat',
    actions: 'Acties',
  });
});

test('Sessie beëindigen (ConfirmDialog): titel, tekst met het apparaat, knop en melding', () => {
  expect(read(['account', 'sessions', 'revokeDialog', 'title'])).toBe('Sessie beëindigen?');
  expect(call(['account', 'sessions', 'revokeDialog', 'description'], 'Firefox op Windows')).toBe(
    'Het apparaat Firefox op Windows wordt uitgelogd.',
  );
  expect(read(['account', 'sessions', 'revokeDialog', 'confirm'])).toBe('Beëindigen');
  expect(read(['account', 'sessions', 'revokeDialog', 'done'])).toBe('De sessie is beëindigd.');
});

test('Andere sessies (ConfirmDialog): titel, tekst, knop en melding', () => {
  expect(read(['account', 'sessions', 'revokeOthersDialog'])).toStrictEqual({
    title: 'Alle andere sessies beëindigen?',
    description: 'Je blijft alleen op dit apparaat ingelogd.',
    confirm: 'Beëindigen',
    done: 'Je andere sessies zijn beëindigd.',
  });
});

test('E-mailadres: kop, huidig adres, veld, knop, gelukt en zelfde adres', () => {
  expect(read(['account', 'email', 'title'])).toBe('E-mailadres');
  expect(call(['account', 'email', 'current'], 'anna@example.test')).toBe('Huidig e-mailadres: anna@example.test');
  expect(read(['account', 'email', 'label'])).toBe('Nieuw e-mailadres');
  expect(read(['account', 'email', 'submit'])).toBe('E-mailadres wijzigen');
  expect(call(['account', 'email', 'requested'], 'anna@example.test')).toBe(
    'We hebben een bevestigingslink gestuurd naar anna@example.test. Daarna volgt een link naar het nieuwe adres.',
  );
  expect(read(['account', 'email', 'same'])).toBe('Dit is al je e-mailadres.');
});

test('/email-bevestigen: titel, knop, stap 1, stap 2 en link terug', () => {
  expect(read(['account', 'confirmEmail'])).toStrictEqual({
    title: 'E-mailadres bevestigen',
    submit: 'Bevestigen',
    oldDone: 'Gelukt. Open nu de link die we naar je nieuwe e-mailadres hebben gestuurd.',
    newDone: 'Je e-mailadres is gewijzigd.',
    toAccount: 'Naar Mijn account',
  });
});

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { coreErrorTexts } from '../copy/errors.ts';
import { ErrorTextsProvider, useErrorText } from './error-texts.tsx';

afterEach(cleanup);

test.each(['constructor', 'toString', '__proto__', 'onbekend'])(
  'onbekende foutcode %s toont de algemene tekst',
  (code) => {
    const { result } = renderHook(useErrorText);

    expect(result.current({ code })).toBe(coreErrorTexts.INTERNAL_ERROR);
  },
);

test('appteksten blijven beschikbaar, met hun eigen algemene foutmelding', () => {
  const { result } = renderHook(useErrorText, {
    wrapper: ({ children }) => (
      <ErrorTextsProvider texts={{ INTERNAL_ERROR: 'Probeer het later opnieuw.', APP_ERROR: 'Dat ging mis.' }}>
        {children}
      </ErrorTextsProvider>
    ),
  });

  expect(result.current({ code: 'APP_ERROR' })).toBe('Dat ging mis.');
  expect(result.current({ code: 'constructor' })).toBe('Probeer het later opnieuw.');
});

test('zonder algemene apptekst blijft de algemene coretekst beschikbaar', () => {
  const { result } = renderHook(useErrorText, {
    wrapper: ({ children }) => <ErrorTextsProvider texts={{}}>{children}</ErrorTextsProvider>,
  });

  expect(result.current(new Error('interne details'))).toBe(coreErrorTexts.INTERNAL_ERROR);
});

test('een expliciet geregistreerde foutcode constructor houdt zijn apptekst', () => {
  const { result } = renderHook(useErrorText, {
    wrapper: ({ children }) => (
      <ErrorTextsProvider texts={{ constructor: 'Bekende appfout.' }}>{children}</ErrorTextsProvider>
    ),
  });

  expect(result.current({ code: 'constructor' })).toBe('Bekende appfout.');
});

// Spec uitgaande-client AC-16: de teksten bij de partnerfouten, letterlijk.
test.each([
  ['UPSTREAM_INVALID', 'Een externe dienst gaf een onverwacht antwoord. Probeer het later opnieuw.'],
  ['UPSTREAM_UNAVAILABLE', 'Een externe dienst is nu niet bereikbaar. Probeer het later opnieuw.'],
  ['UPSTREAM_TIMEOUT', 'Een externe dienst reageerde niet op tijd. Probeer het later opnieuw.'],
])('uitgaande-client/AC-16: %s toont de tekst uit coreErrorTexts', (code, text) => {
  const texts: Readonly<Record<string, string>> = coreErrorTexts;
  const { result } = renderHook(useErrorText);

  expect(texts[code]).toBe(text);
  expect(result.current({ code })).toBe(text);
});

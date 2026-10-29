import { createContext, useContext, type ReactNode } from 'react';
import { coreErrorTexts } from '../copy/errors.ts';

// De app geeft haar teksten per foutcode (src/web/copy/errors.ts) één keer door in main.tsx; core-componenten lezen ze hier.
const ErrorTexts = createContext<Readonly<Record<string, string>>>(coreErrorTexts);

export function ErrorTextsProvider({
  texts,
  children,
}: {
  texts: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return <ErrorTexts.Provider value={texts}>{children}</ErrorTexts.Provider>;
}

// Onbekende code (of geen ApiError): de algemene tekst, nooit de code of een stacktrace.
export function useErrorText(): (error: unknown) => string {
  const texts = useContext(ErrorTexts);
  return (error) => {
    const code =
      typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'INTERNAL_ERROR';
    const text = Object.hasOwn(texts, code) ? texts[code] : undefined;
    return text ?? texts['INTERNAL_ERROR'] ?? coreErrorTexts.INTERNAL_ERROR;
  };
}

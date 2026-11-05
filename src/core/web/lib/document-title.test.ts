import { expect, test } from 'vitest';
import { formatDocumentTitle } from './document-title.ts';

// Paginatitel per scherm (WCAG 2.4.2): scherm eerst, dan de app-naam uit index.html.
test.each([
  ['Accounts', 'Mijn App', 'Accounts · Mijn App'],
  ['Mijn App', 'Mijn App', 'Mijn App'],
  ['Accounts', '', 'Accounts'],
])('%s in %s → %s', (title, app, expected) => {
  expect(formatDocumentTitle(title, app)).toBe(expected);
});

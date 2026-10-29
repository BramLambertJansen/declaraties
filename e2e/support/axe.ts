import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// De enige axe-scan (framework §7): WCAG 2.0/2.1/2.2 A en AA. Een overtreding noemt regel en element.
export async function scanAxe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = result.violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
  expect(violations).toStrictEqual([]);
}

// CSP-schendingen verschijnen als console-melding; de e2e draait met CSP aan (framework §6).
export function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  return violations;
}

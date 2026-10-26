import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

// Prod-SPA-smoke (ADR 0049) zonder database: bewijst dat de productiebundel uit de image laadt en dat de router en het
// foutscherm van de app (RouteError, src/core/web/ui/route-error.tsx) renderen, zonder CSP-schending, ongevangen JS-fout,
// onverwachte console.error of mislukte asset. Zonder database faalt Better Auth al in getSession, dus /api/me geeft 500
// en de guard eindigt op het foutscherm. Een crash in een specifiek scherm (bv. login) valt erbuiten: dat wordt zonder
// database niet bereikt.
// Draait over http in een intern Docker-netwerk: de CSP (security-headers.ts) heeft geen upgrade-insecure-requests en
// browsers negeren HSTS over http, dus de assets laden gewoon van dezelfde origin.

// Een CSP-schending staat niet altijd als console-melding; dit event wel. Als string: init-scripts vallen buiten de CSP.
const CSP_LUISTERAAR = `document.addEventListener('securitypolicyviolation', (event) => {
  console.error('Content Security Policy-schending: ' + event.violatedDirective + ' ' + event.blockedURI);
});`;

function isApiPath(url: string): boolean {
  return url !== '' && new URL(url).pathname.startsWith('/api/');
}

// Verwacht 1: de browser meldt het 500-antwoord van /api/me als "Failed to load resource"; de bron-URL staat in location.
function isApiLoadFailure(message: ConsoleMessage): boolean {
  return message.text().startsWith('Failed to load resource') && isApiPath(message.location().url);
}

// Verwacht 2: de guard gooit de ApiError van /api/me door (guard.ts, actorOrNull), de router gooit hem in MatchInner en
// zijn CatchBoundary vangt hem; React 19 logt elke door een boundary gevangen fout in productie met console.error(error)
// (react-dom, defaultOnCaughtError). Alleen precies één argument dat een ApiError (api-client.ts) met status ≥ 500 is.
async function isCaughtServerApiError(message: ConsoleMessage): Promise<boolean> {
  const args = message.args();
  const [first] = args;
  if (args.length !== 1 || first === undefined) return false;
  return first.evaluate(
    (value: unknown) =>
      value instanceof Error &&
      value.name === 'ApiError' &&
      'status' in value &&
      typeof value.status === 'number' &&
      value.status >= 500,
  );
}

interface Problems {
  readonly list: string[];
  readonly pending: Promise<void>[];
}

function onConsoleError(problems: Problems, message: ConsoleMessage): void {
  if (message.type() !== 'error' || isApiLoadFailure(message)) return;
  const text = message.text();
  problems.pending.push(
    isCaughtServerApiError(message).then((expected) => {
      if (!expected) problems.list.push(`console.error: ${text}`);
    }),
  );
}

function collectProblems(page: Page): Problems {
  const problems: Problems = { list: [], pending: [] };
  page.on('pageerror', (error) => problems.list.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    onConsoleError(problems, message);
  });
  page.on('requestfailed', (request) => {
    if (!isApiPath(request.url())) problems.list.push(`requestfailed: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isApiPath(response.url())) {
      problems.list.push(`http ${String(response.status())}: ${response.url()}`);
    }
  });
  return problems;
}

for (const path of ['/', '/admin/accounts']) {
  test(`productie-SPA toont op ${path} het foutscherm zonder console-fout of CSP-schending`, async ({ page }) => {
    const problems = collectProblems(page);
    await page.addInitScript(CSP_LUISTERAAR);

    await page.goto(path);

    // soft: faalt de heading, dan staat de volledige lijst problemen hieronder toch in de CI-log.
    await expect
      .soft(page.locator('#root').getByRole('heading', { level: 1, name: 'Er ging iets mis' }))
      .toBeVisible({ timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    await Promise.all(problems.pending);
    expect(problems.list).toEqual([]);
  });
}

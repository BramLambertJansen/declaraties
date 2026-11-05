import { defineConfig, devices } from '@playwright/test';

// Browser-smoke tegen de draaiende productie-image (ADR 0049), alleen via scripts/check-image.sh met SMOKE_BROWSER=1.
// Geen webServer: het script start de container en geeft de URL mee. De gewone e2e (playwright.config.ts) slaat deze
// specs over; deze config pakt alleen *.smoke.spec.ts op.
const baseURL = process.env['SMOKE_BASE_URL'];
if (baseURL === undefined || baseURL === '') {
  throw new Error('SMOKE_BASE_URL ontbreekt: draai de smoke via SMOKE_BROWSER=1 scripts/check-image.sh <image>.');
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.smoke.spec.ts',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // De repo is in de container read-only gemount; uitvoer naar een schrijfbare plek.
  outputDir: process.env['SMOKE_OUTPUT_DIR'] ?? 'test-results/smoke',
  use: { baseURL },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});

import { defineConfig, devices } from '@playwright/test';
import { availableParallelism } from 'node:os';
import { weinigGeheugen } from './scripts/kit/geheugen.mjs';

// E2E draait altijd tegen de echte lokale stack, nooit met een gemockte API. Lokaal start de eigenaar die met
// `pnpm dev`; in de runner van `pnpm ui:check` (ADR 0044) start Playwright de API en Vite zelf.
const webPort = process.env['WEB_PORT'] ?? '5173';
// Dezelfde origin als APP_ORIGIN: anders weigeren de CSRF-controle en Better Auth elke POST (localhost ≠ 127.0.0.1).
const baseURL = process.env['APP_ORIGIN'] ?? `http://localhost:${webPort}`;
const inRunner = process.env['RUNNER'] === '1';
const outputDir = process.env['RUNNER_OUTPUT_DIR'];

export default defineConfig({
  testDir: 'e2e',
  // De prod-smoke draait alleen tegen de image (playwright.smoke.config.ts, scripts/check-image.sh).
  testIgnore: '**/*.smoke.spec.ts',
  forbidOnly: true,
  // De helft van de cores, hooguit 4: elke worker draait een eigen Chromium naast de API en Vite.
  workers: weinigGeheugen() ? 1 : Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2))),
  // Overgangen ingekort (styles/index.css): axe meet anders kleuren halverwege transition-colors (flaky contrast).
  use: { baseURL, reducedMotion: 'reduce' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  ...(outputDir === undefined ? {} : { outputDir: `${outputDir}/test-results` }),
  ...(inRunner
    ? {
        webServer: [
          { command: 'node src/api/server.ts', url: 'http://127.0.0.1:8787/api/health' },
          { command: 'node node_modules/vite/bin/vite.js --configLoader native', url: baseURL },
        ],
      }
    : {}),
});

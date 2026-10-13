import { defineConfig } from 'vitest/config';
import { catalogusIndex } from './scripts/kit/catalogus-index.ts';

// unit en web draaien in de sandbox; int alleen via `pnpm test:db` in de runner (framework §4, Tests; ADR 0009).
// In de runner is de repo read-only: de cache gaat dan naar RUNNER_CACHE_DIR.
const runnerCache = process.env['RUNNER_CACHE_DIR'];
// Repo-variabelen van een git-hook weg vóór elke test (test/setup/git-env.ts).
const gitEnv = './test/setup/git-env.ts';

export default defineConfig({
  plugins: [catalogusIndex(import.meta.dirname)],
  ...(runnerCache === undefined ? {} : { cacheDir: runnerCache }),
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // De rails-tests starten ESLint en de bundeltest bouwt met Vite; samen halen ze 5 s niet altijd.
          testTimeout: 15_000,
          include: ['{src,test}/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', 'test/rails/fixtures/**'],
          environment: 'node',
          // Eén database voor alle bestanden: parallel zien racetests de commits van andere bestanden (roles.int.test.ts).
          fileParallelism: false,
          setupFiles: [gitEnv],
        },
      },
      {
        // Componenten en routes in een DOM (jsdom); draait net als unit in de sandbox.
        test: {
          name: 'web',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'int',
          include: ['{src,test}/**/*.int.test.ts'],
          exclude: ['test/rails/fixtures/**'],
          environment: 'node',
          // Eén database voor alle bestanden: parallel zien racetests de commits van andere bestanden (roles.int.test.ts).
          fileParallelism: false,
          setupFiles: [gitEnv],
        },
      },
    ],
  },
});

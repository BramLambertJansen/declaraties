import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };
import { securityHeaders } from './src/core/api/http/security-headers.ts';
import { catalogusIndex } from './scripts/kit/catalogus-index.ts';

// Vaste nonce alleen voor de dev-server: Vite en de React-preamble zetten inline tags. De build en `vite preview`
// gebruiken exact de CSP uit framework §6, zonder nonce (src/core/api/http/security-headers.ts, ook voor de productieserver).
const DEV_NONCE = 'dev-only-nonce';

// Eén bron: browserslist in package.json ("safari >= 16.4") → build.target ("safari16.4").
function buildTarget(queries: readonly string[]): string[] {
  return queries.map((query) => {
    const match = /^(\w+) >= ([\d.]+)$/.exec(query);
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new Error(`browserslist-regel niet te vertalen naar build.target: ${query}`);
    }
    return `${match[1]}${match[2]}`;
  });
}

// src/web/dev/ (rolwisselaar) bestaat alleen in dev (framework §6): bij build wordt elke module daaruit een lege
// module. Gebruik ze daarom alleen via een dynamische import achter isDev; test/ui/bundle.test.ts bewijst het.
const DEV_ONLY_DIR = path.join(import.meta.dirname, 'src/web/dev') + path.sep;
const DEV_ONLY_ID = '\0dev-only';

export function devOnlyModules(): Plugin {
  return {
    name: 'dev-only-modules',
    apply: 'build',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id.startsWith(DEV_ONLY_DIR) === true ? DEV_ONLY_ID : null;
    },
    load(id) {
      return id === DEV_ONLY_ID ? 'export {};' : null;
    },
  };
}

// Lokaal moet de pagina op APP_ORIGIN openen: vanaf een ander adres (de 127.0.0.1-link die Vite zelf toont, een netwerk-IP)
// weigeren de CSRF-controle en Better Auth elke POST ("je verzoek is geweigerd"). Een GET op een ander adres gaat daarom
// met een redirect naar APP_ORIGIN; de terminal toont die link erbij.
export function redirectToAppOrigin(
  request: {
    readonly method?: string | undefined;
    readonly host?: string | undefined;
    readonly url?: string | undefined;
  },
  appOrigin: string,
): string | null {
  const target = new URL(appOrigin);
  if (request.method !== 'GET' || request.host === undefined || request.host === target.host) return null;
  return new URL(request.url ?? '/', target).href;
}

function sameOriginAsApp(appOrigin: string): Plugin {
  return {
    name: 'same-origin-as-app',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const location = redirectToAppOrigin({ method: req.method, host: req.headers.host, url: req.url }, appOrigin);
        if (location === null) {
          next();
          return;
        }
        res.writeHead(307, { location });
        res.end();
      });
      server.httpServer?.once('listening', () => {
        server.config.logger.info(
          `\n  → Open ${appOrigin} (APP_ORIGIN); een ander adres wordt daarheen doorgestuurd.\n`,
        );
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const webPort = Number(env['WEB_PORT'] ?? '5173');
  const apiTarget = `http://127.0.0.1:${env['API_PORT'] ?? '8787'}`;
  const proxy = { '/api': { target: apiTarget } };
  const isDev = command === 'serve' && mode === 'development';

  // In de runner (ADR 0009) is de repo read-only: de cache gaat dan naar RUNNER_CACHE_DIR.
  const runnerCache = env['RUNNER_CACHE_DIR'];

  return {
    root: 'src/web',
    ...(runnerCache === undefined ? {} : { cacheDir: runnerCache }),
    envDir: import.meta.dirname,
    // Bestandsroutes (framework §5): de plugin schrijft src/web/routeTree.gen.ts (gegenereerd, wel gecommit voor typecheck).
    plugins: [
      catalogusIndex(import.meta.dirname),
      devOnlyModules(),
      ...(env['APP_ORIGIN'] === undefined ? [] : [sameOriginAsApp(env['APP_ORIGIN'])]),
      tanstackRouter({
        target: 'react',
        routesDirectory: path.join(import.meta.dirname, 'src/web/routes'),
        generatedRouteTree: path.join(import.meta.dirname, 'src/web/routeTree.gen.ts'),
        autoCodeSplitting: true,
      }),
      react(),
      // Tokens en utilities uit src/web/styles/app.css (framework §7).
      tailwindcss(),
    ],
    html: isDev ? { cspNonce: DEV_NONCE } : {},
    build: { outDir: '../../dist/web', emptyOutDir: true, target: buildTarget(pkg.browserslist) },
    server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy, headers: securityHeaders(DEV_NONCE) },
    preview: { host: '127.0.0.1', port: webPort, strictPort: true, proxy, headers: securityHeaders() },
  };
});

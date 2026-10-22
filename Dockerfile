# Productie-image (ADR 0049): één proces serveert /api en de gebouwde SPA op één origin. Provider-neutraal: elke containerhost
# die een poort en env-variabelen geeft, kan hem draaien. Migraties draaien niet hier, maar apart met dbmate als app_migrator
# (framework §6). Bouwen: `docker build -t <app> .`; controleren: scripts/check-image.sh <image> (ook in CI).
# Basisimage op digest, gelijk aan de runner in compose.yaml; Renovate werkt beide bij.
ARG NODE_IMAGE=node:26.11.1-bookworm-slim@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567

FROM ${NODE_IMAGE} AS pnpm
WORKDIR /app
# Dezelfde pnpm als packageManager in package.json (test/scripts/dockerfile.test.ts bewaakt dat, net als Node en de digest).
RUN npm install --global --no-fund --no-audit pnpm@11.28.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM pnpm AS build
RUN pnpm install --frozen-lockfile
COPY . .
# Alleen de SPA; typecheck, lint en tests draaien in CI vóór de image.
RUN pnpm exec vite build

FROM pnpm AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=8080 \
    WEB_DIR=/app/dist/web
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
# Node draait de TypeScript direct (type stripping, zoals pnpm dev); alleen de serverkant, geen tests of web.
COPY src/api ./src/api
COPY src/core/api ./src/core/api
COPY src/core/shared ./src/core/shared
COPY src/shared ./src/shared
COPY --from=build /app/dist/web ./dist/web
# Niet als root (framework §6); de bestanden blijven van root, dus de app kan zichzelf niet wijzigen.
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.API_PORT ?? '8080') + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/api/server.ts"]

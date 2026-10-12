import { authGateway, createAuth } from '#core/api/auth/index.ts';
import { closeDatabase, pingDatabase, withUser } from '#core/api/db/index.ts';
import { env } from '#core/api/env.ts';
import { createReadiness } from '#core/api/http/readiness.ts';
import { startServer } from '#core/api/http/serve.ts';
import { createWebApp } from '#core/api/http/web.ts';
import { writeJsonLine } from '#core/api/obs/request-log.ts';
import { createSmtpMailer } from '#core/api/mail/smtp.ts';
import { createDevLogin, devAuthSteps } from '#core/api/dev/login-as.ts';
import { APP_NAME } from '#shared/app.ts';
import { buildApp } from './app.ts';
import { invitationMail } from './mail/invitation.ts';
import { createServices } from './services.ts';

// Readiness (GET /api/ready): een probe wacht hooguit 2 s; binnen 1 s krijgt de volgende probe dezelfde uitkomst.
const READY_TIMEOUT_MS = 2000;
const READY_CACHE_MS = 1000;

// env() controleert de hele omgeving bij opstart (framework §6) en faalt met alle fouten tegelijk.
const config = env();
const sendMail = createSmtpMailer(config.smtpUrl, `no-reply@${new URL(config.appOrigin).hostname}`);
const auth = createAuth({
  origin: config.authBaseUrl,
  secret: config.authSecret,
  databaseUrl: config.authDatabaseUrl,
  clientIpHeader: config.clientIpHeader,
  sendInvitation: (invitation) => sendMail(invitationMail(invitation)),
  // De mails van een e-mailwijziging (spec eigen-account).
  sendMail,
  appName: APP_NAME,
});

const gateway = authGateway(auth);

const api = buildApp({
  appOrigin: config.appOrigin,
  auth: gateway,
  withUser,
  services: createServices(auth),
  log: writeJsonLine,
  ready: createReadiness(pingDatabase, { timeoutMs: READY_TIMEOUT_MS, cacheMs: READY_CACHE_MS }),
  // Dev-login alleen lokaal (ADR 0014); in elke andere omgeving bestaat de route niet.
  ...(config.appEnv === 'local' ? { devLogin: createDevLogin(devAuthSteps(auth)) } : {}),
});

// Met WEB_DIR (de containerimage) serveert dezelfde server de SPA op dezelfde origin (ADR 0019); lokaal doet Vite dat.
await startServer(config.webDir === undefined ? api : createWebApp(api, config.webDir), {
  host: config.apiHost,
  port: config.apiPort,
  shutdownTimeoutMs: config.shutdownTimeoutMs,
  onStopped: async () => {
    await Promise.all([closeDatabase(), auth.closePool()]);
  },
});

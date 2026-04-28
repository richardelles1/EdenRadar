import * as Sentry from "@sentry/node";

export function initSentry(): void {
  if (!process.env.SENTRY_DSN) {
    console.warn("[sentry] SENTRY_DSN not set — Sentry error monitoring is disabled");
    return;
  }
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.npm_package_version,
    tracesSampleRate: 0,
  });
}

export { captureException } from "@sentry/node";

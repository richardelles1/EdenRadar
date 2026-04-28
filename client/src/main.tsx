import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

const fallback = (
  <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
    <div className="text-center space-y-3 p-8">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="text-sm text-muted-foreground">Please refresh the page. If this keeps happening, contact support@edenradar.com</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
      >
        Refresh page
      </button>
    </div>
  </div>
);

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={fallback}>
    <App />
  </Sentry.ErrorBoundary>
);

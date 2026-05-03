import type { Page, BrowserContext } from "@playwright/test";

/**
 * EdenRadar wraps the entire app in a `SiteGate` beta-password component
 * (client/src/components/SiteGate.tsx). Only a hand-coded list of public
 * marketing paths bypass it; everything else (including /login, /admin and
 * /unsubscribe) is blocked unless `localStorage["eden-access"] === "true"`.
 *
 * Specs that visit a non-public route MUST call `bypassSiteGate(page)` BEFORE
 * the first navigation. We do this by injecting an init-script so the value
 * is set before any React code runs.
 *
 * NOTE: this also exposes a P1 product issue worth filing as a follow-up —
 * `/unsubscribe` being behind a beta password means email-recipient
 * unsubscribes silently fail in production. See playwright/README.md.
 */
export async function bypassSiteGate(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(() => {
    try {
      window.localStorage.setItem("eden-access", "true");
    } catch {
      /* private mode / test isolation — safe to ignore */
    }
  });
}

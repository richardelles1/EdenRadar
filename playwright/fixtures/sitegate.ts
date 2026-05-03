import type { Page, BrowserContext } from "@playwright/test";

/**
 * EdenRadar wraps the entire app in a `SiteGate` beta-password component
 * (client/src/components/SiteGate.tsx). Only a hand-coded list of public
 * marketing + transactional paths bypass it; everything else (including
 * /login and /admin) is blocked unless `localStorage["eden-access"] === "true"`.
 *
 * Specs that visit a non-public route MUST call `bypassSiteGate(page)` BEFORE
 * the first navigation. We do this by injecting an init-script so the value
 * is set before any React code runs.
 *
 * Email-driven flows (/unsubscribe, /admin/reset-password) are part of the
 * SiteGate allowlist — do NOT call bypassSiteGate() for those, otherwise
 * a regression that re-gates them will go undetected.
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

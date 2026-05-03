import { test, expect } from "@playwright/test";
import {
  cleanupE2ERows,
  closePool,
  getIndustryProfile,
  seedIndustryProfile,
} from "../fixtures/db";
import { signUnsubscribeToken } from "../fixtures/tokens";

test.describe("Unsubscribe flow (RFC 8058 + UI)", () => {
  // Intentionally NOT calling bypassSiteGate — /unsubscribe is on the
  // SiteGate allowlist (see client/src/components/SiteGate.tsx). If a
  // future change re-gates it, these specs must fail so we catch the
  // CAN-SPAM / RFC 8058 regression before it ships.

  test.afterAll(async () => {
    await cleanupE2ERows();
    await closePool();
  });

  test("signed token unsubscribes the user and updates DB", async ({ page }) => {
    const userId = await seedIndustryProfile({ subscribedToDigest: true });
    const token = signUnsubscribeToken(userId);

    await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);

    await expect(page.getByTestId("page-unsubscribe")).toBeVisible();
    await expect(page.getByTestId("text-unsubscribe-success")).toBeVisible({
      timeout: 10_000,
    });

    const profile = await getIndustryProfile(userId);
    expect(profile?.subscribed_to_digest).toBe(false);
  });

  test("repeat unsubscribe shows already-unsubscribed state", async ({ page }) => {
    const userId = await seedIndustryProfile({ subscribedToDigest: false });
    const token = signUnsubscribeToken(userId);

    await page.goto(`/unsubscribe?t=${encodeURIComponent(token)}`);

    await expect(page.getByTestId("text-unsubscribe-already")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("missing token shows error UI", async ({ page }) => {
    await page.goto(`/unsubscribe`);
    await expect(page.getByTestId("text-unsubscribe-error")).toBeVisible();
  });

  test("/unsubscribe is reachable without the SiteGate beta password", async ({ page }) => {
    // Guard against a regression where someone removes /unsubscribe from
    // SiteGate's PUBLIC_PATHS allowlist. We open a fresh context with a
    // clean localStorage (no eden-access key) and assert the SiteGate form
    // never appears, while the unsubscribe page itself does.
    await page.goto(`/unsubscribe`);
    await expect(page.getByTestId("page-unsubscribe")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("site-gate-form")).toHaveCount(0);
  });

  test("/admin/reset-password is reachable without the SiteGate beta password", async ({ page }) => {
    // Same guard as above for Supabase password-recovery links emailed to
    // admins. We don't need to drive the form — just assert the gate
    // doesn't intercept the route.
    await page.goto(`/admin/reset-password`);
    await expect(page.getByTestId("site-gate-form")).toHaveCount(0);
    // Also assert the reset-password page itself rendered, so the test
    // doesn't pass if the route is silently broken for unrelated reasons.
    await expect(page.getByTestId("card-admin-reset-password")).toBeVisible({ timeout: 10_000 });
  });

  test("tampered token shows error UI", async ({ page }) => {
    await page.goto(`/unsubscribe?t=garbage.signature`);
    await expect(page.getByTestId("text-unsubscribe-error")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("RFC 8058 one-click POST endpoint accepts signed token", async ({
    request,
  }) => {
    const userId = await seedIndustryProfile({ subscribedToDigest: true });
    const token = signUnsubscribeToken(userId);

    const res = await request.post(`/unsubscribe?t=${encodeURIComponent(token)}`, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      data: "List-Unsubscribe=One-Click",
    });

    expect(res.status()).toBe(200);
    const profile = await getIndustryProfile(userId);
    expect(profile?.subscribed_to_digest).toBe(false);
  });

  test("JSON unsubscribe API rejects bad token with 400", async ({ request }) => {
    const res = await request.post(`/api/digest/unsubscribe`, {
      data: { token: "not.a.real.token" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

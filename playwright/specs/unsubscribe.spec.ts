import { test, expect } from "@playwright/test";
import {
  cleanupE2ERows,
  closePool,
  getIndustryProfile,
  seedIndustryProfile,
} from "../fixtures/db";
import { signUnsubscribeToken } from "../fixtures/tokens";

test.describe("Unsubscribe flow (RFC 8058 + UI)", () => {
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
